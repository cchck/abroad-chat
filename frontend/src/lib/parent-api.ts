const API_BASE = "http://localhost:8000/api";

function getParentId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("parent_id");
  if (!id) {
    id = "parent_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem("parent_id", id);
  }
  return id;
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
  created_at?: string;
}

export interface ChatReply {
  text: string;
  emotion: string;
  voice_base64: string | null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `请求失败: ${res.status}`);
  }

  return res.json();
}

export const parentApi = {
  bind: (inviteCode: string, nickname: string) => {
    setStoredNickname(nickname);
    return request<ChildBinding>("/wx/bind", {
      method: "POST",
      body: JSON.stringify({
        invite_code: inviteCode,
        openid: getParentId(),
        nickname,
      }),
    });
  },

  getChildren: () =>
    request<ChildBinding[]>(`/wx/children?openid=${encodeURIComponent(getParentId())}`),

  sendMessage: (bindingId: number, content: string) =>
    request<ChatReply>("/wx/chat/send", {
      method: "POST",
      body: JSON.stringify({ binding_id: bindingId, content }),
    }),

  getHistory: (bindingId: number, limit = 50) =>
    request<ChatMessage[]>(`/wx/chat/history?binding_id=${bindingId}&limit=${limit}`),
};
