/** Giới hạn số tác vụ chạy đồng thời (ví dụ số ảnh sharp xử lý cùng lúc trên toàn server). */
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      // Chờ tác vụ khác trả chỗ; chỗ được chuyển thẳng cho mình nên không tăng active
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}
