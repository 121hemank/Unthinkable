import axios from "axios";
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
    timeout: 30000,
});
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
function isTransient(err: any): boolean {
    if (!err?.response)
        return true;
    const status = err.response.status;
    return status === 429 || status >= 500 || err.code === "ECONNABORTED";
}
api.interceptors.response.use((res) => res, async (err) => {
    if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return Promise.reject(err);
    }
    const config = err?.config;
    if (config && !config.__retried && isTransient(err)) {
        config.__retried = true;
        await new Promise((r) => setTimeout(r, 2500));
        return api.request(config);
    }
    if (!err?.response) {
        return Promise.reject(new Error("The clinic server is waking up (it sleeps when idle on the free plan). Please try again in a few seconds."));
    }
    return Promise.reject(err);
});
