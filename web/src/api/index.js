import { createClient } from "./client.js";

export const api = createClient(import.meta.env.VITE_API_URL);

function resource(path) {
  return {
    list: (query, signal) => api.request("GET", path, { query, signal }),
    get: (id, signal) => api.request("GET", `${path}/${encodeURIComponent(id)}`, { signal }),
    create: (body) => api.request("POST", path, { body }),
    update: (id, body) => api.request("PATCH", `${path}/${encodeURIComponent(id)}`, { body }),
    remove: (id) => api.request("DELETE", `${path}/${encodeURIComponent(id)}`),
  };
}

export const dishesApi = resource("/api/dishes");
export const chefsApi = resource("/api/chefs");
export const ingredientsApi = resource("/api/ingredients");

export const bookingsApi = {
  create: (body) => api.request("POST", "/api/bookings", { body }),
  get: (code, signal) => api.request("GET", `/api/bookings/${encodeURIComponent(code)}`, { signal }),
};

export const adminBookingsApi = {
  list: (query, signal) => api.request("GET", "/api/admin/bookings", { query, signal }),
  update: (id, body) => api.request("PATCH", `/api/admin/bookings/${encodeURIComponent(id)}`, { body }),
};

export const getStats = (signal) => api.request("GET", "/api/stats", { signal });
export const getOptions = (signal) => api.request("GET", "/api/options", { signal });
