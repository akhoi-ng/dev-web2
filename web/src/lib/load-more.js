// Trạng thái danh sách tích lũy cho "Tải thêm" và "Cuộn vô hạn". Thuần JS (chạy được dưới node --test).
// key = khóa của lần tìm (criteriaKey): đổi tìm kiếm -> danh sách mới, phản hồi của lần tìm cũ bị bỏ.

export function initialList(key) {
  return { key, items: [], nextPage: 1, total: null, pending: false, end: false, error: null };
}

export function startLoading(state, key) {
  if (key !== state.key) return state;
  return { ...state, pending: true, error: null };
}

// Nối một trang vào danh sách; bỏ món đã có (offset có thể lệch khi dữ liệu đổi giữa hai lần tải)
export function applyPage(state, key, { items, total, page, pageSize }) {
  if (key !== state.key) return state;
  const seen = new Set(state.items.map((d) => d.id));
  const fresh = items.filter((d) => !seen.has(d.id));
  return {
    ...state,
    items: [...state.items, ...fresh],
    total,
    nextPage: page + 1,
    pending: false,
    end: page * pageSize >= total || items.length === 0,
    error: null,
  };
}

export function applyError(state, key, error) {
  if (key !== state.key) return state;
  return { ...state, pending: false, error };
}

// Chỉ tải tiếp khi không đang tải, chưa hết và không có lỗi chờ "Thử lại"
export function canLoad(state) {
  return !state.pending && !state.end && !state.error;
}
