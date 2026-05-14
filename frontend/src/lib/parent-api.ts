const API_BASE = "http://localhost:8000/api";

function getParentToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("parent_token");
}

function setParentToken(token: string) {
  localStorage.setItem("parent_token", token);
}

export function isParentLoggedIn(): boolean {
  return !!getParentToken();
}

export function parentLogout() {
  localStorage.removeItem("parent_token");
  localStorage.removeItem("parent_nickname");
}

export function getStoredNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("parent_nickname") || "";
}

export function setStoredNickname(name: string) {
  localStorage.setItem("parent_nickname", name);
}

export interface ChildBinding {
  binding_id: number;
  student_name: string;
  relationship_name: string | null;
}

export interface ChatMessage {
  id?: number;
  role: "parent" | "ai";
  content_text: string;
  emotion_tag?: string;
  voice_base64?: string | null;
  content_voice_url?: string | null;
  created_at?: string;
}

export interface ChatReply {
  text: string;
  emotion: string;
  voice_base64: string | null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getParentToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    parentLogout();
    throw new Error("未登录");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "请求失败，请稍后再试");
  }

  return res.json();
}

export const parentApi = {
  /**
   * WeChat login: in real mini-program, code comes from wx.login().
   * For web dev/testing, use mockLogin() instead.
   */
  wxLogin: (code: string) =>
    request<{ access_token: string; parent_id: number }>(`/wx/login?code=${encodeURIComponent(code)}`, {
      method: "POST",
    }).then((res) => {
      setParentToken(res.access_token);
      return res;
    }),

  devLogin: (nickname: string) =>
    request<{ access_token: string; parent_id: number }>(
      `/wx/dev-login?nickname=${encodeURIComponent(nickname)}`,
      { method: "POST" },
    ).then((res) => {
      setParentToken(res.access_token);
      setStoredNickname(nickname);
      return res;
    }),

  bind: (inviteCode: string, nickname: string) => {
    setStoredNickname(nickname);
    return request<ChildBinding>("/wx/bind", {
      method: "POST",
      body: JSON.stringify({
        invite_code: inviteCode,
        nickname,
      }),
    });
  },

  getChildren: () => request<ChildBinding[]>("/wx/children"),

  sendMessage: (bindingId: number, content: string) =>
    request<ChatReply>("/wx/chat/send", {
      method: "POST",
      body: JSON.stringify({ binding_id: bindingId, content }),
    }),

  getHistory: (bindingId: number, limit = 50) =>
    request<ChatMessage[]>(`/wx/chat/history?binding_id=${bindingId}&limit=${limit}`),
};
