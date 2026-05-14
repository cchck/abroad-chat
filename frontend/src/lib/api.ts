const API_BASE = "http://localhost:8000/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return new Promise<T>(() => {});
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "请求失败，请稍后再试");
  }

  return res.json();
}

export const api = {
  register: (data: { email: string; password: string; name: string }) =>
    request<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getProfile: () => request<StudentProfile>("/student/profile"),

  updateProfile: (data: Partial<StudentProfile>) =>
    request<StudentProfile>("/student/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getApiKeys: () => request<ApiKeysInfo>("/student/api-keys"),

  updateApiKeys: (data: ApiKeysUpdate) =>
    request<ApiKeysInfo>("/student/api-keys", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getPersona: () => request<PersonaConfig | null>("/student/persona"),

  updatePersona: (data: PersonaConfigUpdate) =>
    request<PersonaConfig>("/student/persona", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  analyzeChatHistory: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token");
    return fetch(`${API_BASE}/student/persona/analyze`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "分析失败");
      }
      return res.json() as Promise<AnalysisResult>;
    });
  },

  getMaterials: () => request<Material[]>("/student/materials"),

  addMaterial: (data: { content: string; proactive: boolean }) =>
    request<Material>("/student/materials", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteMaterial: (id: number) =>
    request<{ ok: boolean }>(`/student/materials/${id}`, {
      method: "DELETE",
    }),

  createInvite: (data: { relationship_name: string }) =>
    request<Invite>("/student/invite", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getBindings: () => request<Binding[]>("/student/bindings"),

  getNotifications: () => request<AppNotification[]>("/student/notifications"),

  markNotificationRead: (id: number) =>
    request<{ ok: boolean }>(`/student/notifications/${id}/read`, {
      method: "PUT",
    }),

  updateSummarySettings: (data: { summary_enabled?: boolean; summary_interval?: number }) =>
    request<{ summary_enabled: boolean; summary_interval: number }>("/student/summary-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getSummaries: () => request<ChatSummary[]>("/student/summaries"),

  getChatHistory: (bindingId: number) =>
    request<ChatHistoryMessage[]>(`/student/chat-history/${bindingId}`),

  getVoiceStatus: () => request<VoiceProfile | null>("/student/voice/status"),

  setVoiceModelId: (modelId: string) =>
    request<VoiceProfile>("/student/voice/model-id", {
      method: "PUT",
      body: JSON.stringify({ fish_audio_model_id: modelId }),
    }),

  uploadVoice: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token");
    return fetch(`${API_BASE}/student/voice/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "上传失败，请稍后再试");
      }
      return res.json() as Promise<VoiceProfile>;
    });
  },
};

export interface StudentProfile {
  id: number;
  email: string;
  name: string;
  school: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  major: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  has_llm_key: boolean;
  has_fish_key: boolean;
  summary_enabled: boolean;
  summary_interval: number;
}

export interface AnalysisResult {
  catchphrases: string;
  habits: string;
  tone: string;
  sample_summary: string;
}

export interface ApiKeysInfo {
  llm_provider: string | null;
  llm_model: string | null;
  has_llm_key: boolean;
  has_fish_key: boolean;
  supported_providers: { id: string; name: string; default_model: string }[];
}

export interface ApiKeysUpdate {
  llm_provider?: string;
  llm_model?: string;
  llm_api_key?: string;
  fish_audio_api_key?: string;
}

export interface PersonaConfig {
  speaking_style: Record<string, string> | null;
  chat_samples: string | null;
  parent_specific_styles: Record<string, string> | null;
  updated_at: string | null;
}

export interface PersonaConfigUpdate {
  speaking_style?: Record<string, string>;
  chat_samples?: string;
  parent_specific_styles?: Record<string, string>;
}

export interface Material {
  id: number;
  source: string;
  content: string;
  proactive: boolean;
  created_at: string;
}

export interface Invite {
  invite_code: string;
  relationship_name: string | null;
  status: string;
}

export interface Binding {
  id: number;
  invite_code: string;
  relationship_name: string | null;
  status: string;
  parent_nickname: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  content: string;
  is_read: boolean;
  urgency: string;
  created_at: string;
}

export interface ChatSummary {
  id: number;
  binding_id: number;
  message_count: number;
  summary: string;
  topics: string | null;
  mood: string | null;
  created_at: string;
}

export interface ChatHistoryMessage {
  role: string;
  content_text: string;
  content_voice_url: string | null;
  emotion_tag: string | null;
  created_at: string;
}

export interface VoiceProfile {
  fish_audio_model_id: string | null;
  status: string;
  created_at: string;
}
