// "Tải thêm" và "Cuộn vô hạn" của thực đơn (Block 7, bản SSR).
// Server đã dựng trang 1. Script đọc trang tiếp theo bằng GET /dishes/items?<tiêu chí>&page=n
// (server trả HTML các thẻ món + header X-Total-Pages) rồi nối vào lưới. Chỉ đọc dữ liệu, không gửi.
(function () {
  const box = document.querySelector("[data-load-more]");
  const grid = document.querySelector("[data-dish-grid]");
  if (!box || !grid) return;

  const view = box.dataset.view;
  const total = Number(box.dataset.total);
  let totalPages = Number(box.dataset.totalPages);
  let nextPage = Number(box.dataset.nextPage);
  let pending = false;

  const button = box.querySelector("[data-more-button]");
  const loading = box.querySelector("[data-loading]");
  const endText = box.querySelector("[data-end]");
  const errorText = box.querySelector("[data-error]");
  const sentinel = box.querySelector("[data-sentinel]");
  const shownCount = document.querySelector("[data-shown-count]");

  // Món đã hiện (theo id): trang sau trùng id thì bỏ qua
  const seen = new Set(Array.from(grid.querySelectorAll("[data-dish-id]"), (el) => el.dataset.dishId));
  const ended = () => nextPage > totalPages;
  // Class "flex" của Tailwind thắng thuộc tính hidden, nên ẩn bằng class "hidden"
  const show = (el, on) => el && el.classList.toggle("hidden", !on);

  function render() {
    const count = seen.size;
    if (shownCount) shownCount.textContent = String(count);
    show(endText, ended());
    if (button) {
      // Cuộn vô hạn không cần nút (nút chỉ là link dự phòng khi không có JavaScript)
      show(button, !ended() && view !== "scroll" && !pending);
      button.textContent = `Tải thêm (${count}/${total})`;
    }
    show(loading, pending);
  }

  async function loadNext() {
    if (pending || ended()) return;
    pending = true;
    show(errorText, false);
    render();
    try {
      const base = box.dataset.itemsHref;
      const url = base + (base.includes("?") ? "&" : "?") + "page=" + nextPage;
      const res = await fetch(url, { headers: { Accept: "text/html" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const page = Number(res.headers.get("X-Page"));
      totalPages = Number(res.headers.get("X-Total-Pages")) || totalPages;
      const tpl = document.createElement("template");
      tpl.innerHTML = await res.text();
      tpl.content.querySelectorAll("[data-dish-id]").forEach((el) => {
        if (seen.has(el.dataset.dishId)) return;
        seen.add(el.dataset.dishId);
        grid.appendChild(el);
      });
      nextPage = (page || nextPage) + 1;
    } catch {
      show(errorText, true);
      pending = false;
      render();
      return;
    }
    pending = false;
    render();
    // Observer chỉ báo khi sentinel đổi trạng thái: lưới còn ngắn hơn màn hình thì tự tải tiếp
    if (view === "scroll" && sentinel && sentinel.getBoundingClientRect().top < window.innerHeight + 200) loadNext();
  }

  if (button) {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      loadNext();
    });
  }
  const retry = box.querySelector("[data-retry]");
  if (retry) retry.addEventListener("click", loadNext);

  // Cuộn vô hạn: sentinel nằm dưới lưới; còn cách 200px thì tải tiếp
  if (view === "scroll" && sentinel && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext();
        if (ended()) observer.disconnect();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
  }
  render();
})();
