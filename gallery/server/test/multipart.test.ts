import fs from "node:fs/promises";
import os from "node:os";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorHandler } from "../src/http.js";
import { parseMultipart } from "../src/upload/multipart.js";

const KiB = 1024;
let server: Server;
let base: string;
let tmpBefore: string[];

beforeAll(async () => {
  tmpBefore = await fs.readdir(os.tmpdir());
  const app = express();
  app.post("/upload", async (req, res) => {
    const upload = await parseMultipart(req, { maxFiles: 3, maxFileBytes: 100 * KiB, maxRequestBytes: 250 * KiB });
    res.json({
      fields: upload.fields,
      files: upload.files.map((f) => ({
        index: f.index,
        filename: f.filename,
        bytes: f.bytes,
        oversize: f.oversize,
        head: f.head.toString("hex"),
        inMemory: f.data ? f.data.length : null,
      })),
    });
  });
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();
const blob = (bytes: number, fill = 0x41) => new Blob([Buffer.alloc(bytes, fill)]);

describe("parseMultipart", () => {
  it("nhận trường text và nhiều file cùng tên photos, giữ thứ tự index và tên Unicode", async () => {
    const form = new FormData();
    form.append("title", "Bờ biển");
    form.append("photos", blob(10 * KiB), "bờ-biển.jpg");
    form.append("photos", blob(5 * KiB), "hồ.png");
    const res = await fetch(`${base}/upload`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.fields).toEqual({ title: "Bờ biển" });
    expect(body.files.map((f: { index: number; filename: string; bytes: number; inMemory: number }) => [f.index, f.filename, f.bytes, f.inMemory])).toEqual([
      [0, "bờ-biển.jpg", 10 * KiB, 10 * KiB],
      [1, "hồ.png", 5 * KiB, 5 * KiB],
    ]);
  });

  it("file vượt ngưỡng riêng chỉ bị đánh dấu, không giữ bytes nào; file khác vẫn nhận", async () => {
    const form = new FormData();
    form.append("photos", blob(20 * KiB), "ok.jpg");
    form.append("photos", blob(150 * KiB), "big.jpg");
    const res = await fetch(`${base}/upload`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const { files } = await json(res);
    expect(files[0]).toMatchObject({ index: 0, oversize: false, inMemory: 20 * KiB });
    expect(files[1]).toMatchObject({ index: 1, oversize: true, inMemory: null });
  });

  it("quá số file: từ chối cả request (400)", async () => {
    const form = new FormData();
    for (let i = 0; i < 4; i++) form.append("photos", blob(KiB), `${i}.jpg`);
    const res = await fetch(`${base}/upload`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("TOO_MANY_FILES");
  });

  it("tổng request vượt ngưỡng: 413", async () => {
    const form = new FormData();
    for (let i = 0; i < 3; i++) form.append("photos", blob(95 * KiB), `${i}.jpg`);
    const res = await fetch(`${base}/upload`, { method: "POST", body: form });
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("413 cả khi client không gửi Content-Length (chunked)", async () => {
    const boundary = "gallery";
    const part = (i: number) =>
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        Buffer.alloc(95 * KiB, 0x42),
        Buffer.from("\r\n"),
      ]);
    const body = Buffer.concat([part(0), part(1), part(2), Buffer.from(`--${boundary}--\r\n`)]);
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < body.length; i += 16 * KiB) controller.enqueue(body.subarray(i, i + 16 * KiB));
        controller.close();
      },
    });
    const res = await fetch(`${base}/upload`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
  });

  it("không có file: 400; không phải multipart: 415; trường file sai tên: 400", async () => {
    const empty = new FormData();
    empty.append("title", "x");
    expect((await fetch(`${base}/upload`, { method: "POST", body: empty })).status).toBe(400);

    const jsonRes = await fetch(`${base}/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(jsonRes.status).toBe(415);

    const wrong = new FormData();
    wrong.append("file", blob(KiB), "a.jpg");
    const res = await fetch(`${base}/upload`, { method: "POST", body: wrong });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("UNEXPECTED_FIELD");
  });

  it("không ghi file nào ra thư mục temp của hệ điều hành", async () => {
    const created = (await fs.readdir(os.tmpdir())).filter((f) => !tmpBefore.includes(f) && /\.upload$|photo-gallery/.test(f));
    expect(created).toEqual([]);
  });
});
