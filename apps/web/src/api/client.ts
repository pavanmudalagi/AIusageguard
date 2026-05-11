import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aiug_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  localStorage.setItem("aiug_token", data.token);
  return data.user;
}

export function logout() {
  localStorage.removeItem("aiug_token");
}
