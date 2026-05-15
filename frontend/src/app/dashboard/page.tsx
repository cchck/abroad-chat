"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ProfilePanel from "@/components/panels/profile-panel";
import ApiKeysPanel from "@/components/panels/api-keys-panel";
import PersonaPanel from "@/components/panels/persona-panel";
import MaterialsPanel from "@/components/panels/materials-panel";
import BindingsPanel from "@/components/panels/bindings-panel";
import NotificationsPanel from "@/components/panels/notifications-panel";
import {
  api,
  type StudentProfile,
  type AppNotification,
  type ChatSummary,
  type Material,
  type Binding,
  type ChatHistoryMessage,
  type UsageStats,
} from "@/lib/api";
import {
  User, Key, MessageSquare, FileText, Users, Bell,
  X, LogOut, CheckCircle2, Lock, ChevronRight,
  AlertTriangle, Sparkles, Settings2, Send, Lightbulb,
  Trash2, Megaphone, MessageCircle, Loader2, ArrowLeft,
} from "lucide-react";

type PanelId = "profile" | "api-keys" | "persona" | "materials" | "bindings" | "notifications" | null;

interface SetupStep {
  id: PanelId;
  title: string;
  subtitle: string;
  icon: typeof User;
  iconColor: string;
  check: (p: StudentProfile) => boolean;
}

const SETUP_STEPS: SetupStep[] = [
  { id: "api-keys", title: "配置 AI 模型", subtitle: "选择模型提供商并填写 API Key", icon: Key, iconColor: "text-amber-500 bg-amber-50", check: (p) => !!p.has_llm_key },
  { id: "profile", title: "完善个人资料", subtitle: "填写学校、城市等基本信息", icon: User, iconColor: "text-sky-500 bg-sky-50", check: (p) => !!(p.school && p.city) },
  { id: "persona", title: "设置说话风格", subtitle: "上传聊天记录让 AI 学习你的风格", icon: MessageSquare, iconColor: "text-violet-500 bg-violet-50", check: (_p) => false },
  { id: "materials", title: "喂素材给 AI", subtitle: "告诉 AI 你最近的动态", icon: FileText, iconColor: "text-emerald-500 bg-emerald-50", check: (_p) => false },
  { id: "bindings", title: "绑定家人", subtitle: "生成邀请码并上传语音", icon: Users, iconColor: "text-rose-500 bg-rose-50", check: (_p) => false },
];

const PANEL_COMPONENTS: Record<string, React.ComponentType> = {
  profile: ProfilePanel,
  "api-keys": ApiKeysPanel,
  persona: PersonaPanel,
  materials: MaterialsPanel,
  bindings: BindingsPanel,
  notifications: NotificationsPanel,
};

const MOOD_MAP: Record<string, { label: string; color: string }> = {
  happy: { label: "开心", color: "bg-green-50 text-green-600" },
  neutral: { label: "平静", color: "bg-sand-100 text-sand-500" },
  worried: { label: "担忧", color: "bg-amber-50 text-amber-600" },
  sad: { label: "伤感", color: "bg-sky-50 text-sky-600" },
  angry: { label: "生气", color: "bg-red-50 text-red-600" },
};

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  const [savingSummary, setSavingSummary] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [searchStats, setSearchStats] = useState({ search_count: 0, input_tokens: 0, output_tokens: 0 });
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loadingBindings, setLoadingBindings] = useState(true);

  // Chat history overlay
  const [chatOverlay, setChatOverlay] = useState<{ bindingId: number; name: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatHistoryMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Materials quick-add
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialInput, setMaterialInput] = useState("");
  const [materialProactive, setMaterialProactive] = useState(false);
  const [addingMaterial, setAddingMaterial] = useState(false);

  const refreshProfile = useCallback(() => {
    api.getProfile().then(setProfile).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    setReady(true);
    refreshProfile();
    api.getNotifications()
      .then((n) => { setNotifications(n); setLoadingNotifs(false); })
      .catch(() => setLoadingNotifs(false));
    api.getSummaries()
      .then((s) => { setSummaries(s); setLoadingSummaries(false); })
      .catch(() => setLoadingSummaries(false));
    api.getMaterials()
      .then(setMaterials)
      .catch(() => {});
    api.getBindings()
      .then((b) => { setBindings(b); setLoadingBindings(false); })
      .catch(() => setLoadingBindings(false));
    api.getSearchStats()
      .then(setSearchStats)
      .catch(() => {});
    api.getUsageStats()
      .then(setUsageStats)
      .catch(() => {});
  }, [router, refreshProfile]);

  const handleLogout = () => {
    if (window.confirm("确定要退出登录吗？")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  };

  const handleClosePanel = () => {
    setActivePanel(null);
    refreshProfile();
    api.getMaterials().then(setMaterials).catch(() => {});
    api.getBindings().then(setBindings).catch(() => {});
  };

  const handleAddMaterial = async () => {
    const text = materialInput.trim();
    if (!text || addingMaterial) return;
    setAddingMaterial(true);
    try {
      const m = await api.addMaterial({ content: text, proactive: materialProactive });
      setMaterials((prev) => [m, ...prev]);
      setMaterialInput("");
      setMaterialProactive(false);
    } catch { /* ignore */ }
    finally { setAddingMaterial(false); }
  };

  const handleDeleteMaterial = async (id: number) => {
    try {
      await api.deleteMaterial(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch { /* ignore */ }
  };

  const handleOpenChat = async (bindingId: number, name: string) => {
    setChatOverlay({ bindingId, name });
    setLoadingChat(true);
    setChatMessages([]);
    try {
      const msgs = await api.getChatHistory(bindingId);
      setChatMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "instant" }), 50);
    } catch {
      setChatMessages([]);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleCloseChat = () => {
    setChatOverlay(null);
    setChatMessages([]);
  };

  if (!ready || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-warm-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const completedSteps = SETUP_STEPS.filter((s) => s.check(profile)).length;
  const currentStepIndex = SETUP_STEPS.findIndex((s) => !s.check(profile));
  const isSetupComplete = completedSteps >= 2;
  const ActiveComponent = activePanel ? PANEL_COMPONENTS[activePanel] : null;
  const unreadNotifs = notifications.filter((n) => !n.is_read).length;
  const activeBindings = bindings.filter((b) => b.status === "active");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 border-b border-sand-200/60">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">分</span>
            </div>
            <span className="font-semibold text-sand-800 text-sm">留学分身</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePanel("notifications")}
              className="relative p-2 text-sand-400 hover:text-sand-600 hover:bg-sand-100 rounded-lg transition-colors cursor-pointer"
            >
              <Bell size={18} />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifs}
                </span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-sand-400 hover:text-sand-600 transition-colors cursor-pointer px-2 py-1.5 rounded-lg hover:bg-sand-100"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Welcome */}
        <div className="mb-6 anim-slide-up">
          <h1 className="text-xl font-bold text-sand-900">
            {profile.name}，你好
          </h1>
          <p className="text-sand-400 text-sm mt-0.5">
            {isSetupComplete ? "管理你的 AI 分身" : "让我们一步步配置你的 AI 分身"}
          </p>
        </div>

        <div className="flex gap-6 items-start">
          {/* Left: Main content area */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Onboarding / Setup Progress */}
            {!isSetupComplete && (
              <div className="bg-white rounded-2xl border border-sand-200/80 overflow-hidden anim-slide-up" style={{ animationDelay: "50ms" }}>
                <div className="px-5 py-4 border-b border-sand-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-sand-800 text-sm">开始配置</h2>
                    <p className="text-xs text-sand-400 mt-0.5">完成以下步骤，激活你的 AI 分身</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {SETUP_STEPS.map((s, i) => (
                        <div key={s.id} className={`w-6 h-1.5 rounded-full transition-colors duration-500 ${
                          s.check(profile) ? "bg-success" : i === currentStepIndex ? "bg-primary shimmer-bg" : "bg-sand-200"
                        }`} />
                      ))}
                    </div>
                    <span className="text-xs text-sand-400 ml-1">{completedSteps}/{SETUP_STEPS.length}</span>
                  </div>
                </div>

                <div className="divide-y divide-sand-100">
                  {SETUP_STEPS.map((step, i) => {
                    const done = step.check(profile);
                    const isCurrent = i === currentStepIndex;
                    const isLocked = i > currentStepIndex && !done;
                    const Icon = step.icon;

                    return (
                      <button
                        key={step.id}
                        onClick={() => !isLocked && setActivePanel(step.id)}
                        disabled={isLocked}
                        className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-all ${
                          done
                            ? "opacity-60"
                            : isCurrent
                            ? "bg-primary-50/50 hover:bg-primary-50"
                            : isLocked
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-sand-50 cursor-pointer"
                        } ${!isLocked && !done ? "cursor-pointer" : ""}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          done ? "bg-success-light" : isCurrent ? step.iconColor : "bg-sand-100"
                        }`}>
                          {done ? (
                            <CheckCircle2 size={18} className="text-success anim-checkmark" />
                          ) : isLocked ? (
                            <Lock size={16} className="text-sand-400" />
                          ) : (
                            <Icon size={18} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${done ? "text-sand-500 line-through" : "text-sand-800"}`}>
                            {step.title}
                          </p>
                          <p className="text-xs text-sand-400 mt-0.5">{step.subtitle}</p>
                        </div>
                        {isCurrent && !done && (
                          <span className="shrink-0 text-xs font-medium text-primary bg-warm-100 px-2.5 py-1 rounded-full btn-press">
                            开始
                          </span>
                        )}
                        {!done && !isLocked && !isCurrent && (
                          <ChevronRight size={16} className="text-sand-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick config cards — shown after setup */}
            {isSetupComplete && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 anim-slide-up" style={{ animationDelay: "50ms" }}>
                {SETUP_STEPS.map((step) => {
                  const Icon = step.icon;
                  const done = step.check(profile);
                  return (
                    <button
                      key={step.id}
                      onClick={() => setActivePanel(step.id)}
                      className="group bg-white rounded-xl border border-sand-200/80 p-3.5 text-left hover:border-sand-300 hover:shadow-sm transition-all cursor-pointer btn-press"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${step.iconColor}`}>
                        <Icon size={16} />
                      </div>
                      <p className="text-xs font-semibold text-sand-700">{step.title}</p>
                      <p className="text-[10px] text-sand-400 mt-0.5">{done ? "已配置" : step.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick material add */}
            <div className="bg-white rounded-2xl border border-sand-200/80 overflow-hidden anim-slide-up" style={{ animationDelay: "80ms" }}>
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Lightbulb size={15} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={materialInput}
                        onChange={(e) => setMaterialInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddMaterial(); }}
                        placeholder="告诉 AI 你最近的动态..."
                        className="flex-1 px-3 py-2 rounded-xl border border-sand-200 text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40 transition-all placeholder:text-sand-400"
                      />
                      <button
                        onClick={handleAddMaterial}
                        disabled={!materialInput.trim() || addingMaterial}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer btn-press ${
                          materialInput.trim()
                            ? "bg-primary text-white hover:bg-primary-dark"
                            : "bg-sand-100 text-sand-300"
                        }`}
                      >
                        <Send size={15} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMaterialProactive(!materialProactive)}
                      className={`flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer select-none border ${
                        materialProactive
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-transparent border-sand-200 text-sand-400 hover:border-sand-300 hover:text-sand-500"
                      }`}
                    >
                      <Megaphone size={materialProactive ? 12 : 11} className={`transition-all duration-200 ${materialProactive ? "text-primary" : "text-sand-300"}`} strokeWidth={materialProactive ? 2.2 : 1.5} />
                      <span className={`transition-all duration-200 ${materialProactive ? "text-[11px] font-medium text-primary" : "text-[11px] font-normal text-sand-400"}`}>
                        {materialProactive ? "AI 会主动提起" : "AI 不会主动提起"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {materials.length > 0 && (
                <div className="border-t border-sand-100">
                  {materials.slice(0, 4).map((m) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 group hover:bg-sand-50/50 transition-colors">
                      <span className="w-1 h-1 rounded-full bg-sand-300 shrink-0" />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <p className="text-xs text-sand-600 truncate">{m.content}</p>
                        {m.proactive && (
                          <span className="shrink-0" aria-label="AI 会主动提起"><Megaphone size={10} className="text-primary/50" /></span>
                        )}
                      </div>
                      <span className="text-[10px] text-sand-300 shrink-0">
                        {(() => {
                          const diff = Date.now() - new Date(m.created_at).getTime();
                          if (diff < 60000) return "刚刚";
                          if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
                          if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
                          return `${Math.floor(diff / 86400000)}天前`;
                        })()}
                      </span>
                      <button
                        onClick={() => handleDeleteMaterial(m.id)}
                        className="opacity-0 group-hover:opacity-100 text-sand-300 hover:text-danger transition-all cursor-pointer p-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {materials.length > 4 && (
                    <button
                      onClick={() => setActivePanel("materials")}
                      className="w-full px-4 py-2 text-xs text-primary hover:text-primary-dark hover:bg-sand-50 transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      查看全部 {materials.length} 条素材 <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-2xl border border-sand-200/80 overflow-hidden anim-slide-up" style={{ animationDelay: "120ms" }}>
              <div className="px-5 py-4 border-b border-sand-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-sand-500" />
                  <h2 className="font-semibold text-sand-800 text-sm">通知中心</h2>
                  {unreadNotifs > 0 && (
                    <span className="text-[10px] font-bold text-white bg-danger px-1.5 py-0.5 rounded-full">{unreadNotifs} 条未读</span>
                  )}
                </div>
                <button
                  onClick={() => setActivePanel("notifications")}
                  className="text-xs text-primary hover:text-primary-dark transition-colors cursor-pointer"
                >
                  查看全部
                </button>
              </div>

              <div className="divide-y divide-sand-100">
                {loadingNotifs ? (
                  <div className="px-5 py-8 flex justify-center">
                    <div className="w-5 h-5 border-2 border-sand-200 border-t-sand-400 rounded-full animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-sand-100 flex items-center justify-center mx-auto mb-3">
                      <Bell size={20} className="text-sand-400" />
                    </div>
                    <p className="text-sm text-sand-500 font-medium">暂无通知</p>
                    <p className="text-xs text-sand-400 mt-1">当 AI 遇到敏感话题时会在这里通知你</p>
                  </div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div key={n.id} className={`px-5 py-3.5 flex items-start gap-3 ${!n.is_read ? "bg-warm-50/50" : ""}`}>
                      <div className="mt-0.5 shrink-0">
                        {n.urgency === "urgent" ? (
                          <AlertTriangle size={16} className="text-warm-500" />
                        ) : (
                          <Bell size={16} className="text-sand-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            n.type === "sensitive_topic" ? "bg-warm-100 text-warm-600" : "bg-sand-100 text-sand-500"
                          }`}>
                            {n.type === "sensitive_topic" ? "敏感话题" : n.type}
                          </span>
                          <span className="text-[10px] text-sand-400">
                            {new Date(n.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </div>
                        <p className="text-sm text-sand-700 line-clamp-2">{n.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Token Usage ── */}
            {usageStats && usageStats.total_messages > 0 && (
              <div className="bg-white rounded-2xl border border-sand-200/80 overflow-hidden anim-slide-up" style={{ animationDelay: "150ms" }}>
                <div className="px-5 py-4 border-b border-sand-100">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-500" />
                    <h2 className="font-semibold text-sand-800 text-sm">本月用量</h2>
                    <span className="text-[10px] text-sand-400 ml-auto">{usageStats.month}</span>
                  </div>
                </div>
                <div className="px-5 py-4">
                  {/* Summary numbers */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-sand-50/70 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-lg font-bold text-sand-800">{usageStats.total_messages}</p>
                      <p className="text-[10px] text-sand-400">AI 回复</p>
                    </div>
                    <div className="bg-sand-50/70 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-lg font-bold text-sand-800">
                        {((usageStats.total_input_tokens + usageStats.total_output_tokens) / 1000).toFixed(1)}k
                      </p>
                      <p className="text-[10px] text-sand-400">总 Tokens</p>
                    </div>
                    <div className="bg-sand-50/70 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-lg font-bold text-sand-800">
                        {(usageStats.total_output_tokens / 1000).toFixed(1)}k
                      </p>
                      <p className="text-[10px] text-sand-400">输出 Tokens</p>
                    </div>
                  </div>

                  {/* Daily bar chart */}
                  {usageStats.daily.length > 1 && (
                    <div className="mb-4">
                      <p className="text-[11px] text-sand-500 mb-2">每日用量</p>
                      <div className="flex items-end gap-[3px] h-16">
                        {usageStats.daily.map((d) => {
                          const total = d.input_tokens + d.output_tokens;
                          const max = Math.max(...usageStats.daily.map((x) => x.input_tokens + x.output_tokens));
                          const pct = max > 0 ? (total / max) * 100 : 0;
                          return (
                            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <div
                                className="w-full bg-primary/20 rounded-sm hover:bg-primary/40 transition-colors min-h-[2px]"
                                style={{ height: `${Math.max(pct, 3)}%` }}
                              />
                              <div className="hidden group-hover:block absolute -top-8 bg-sand-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                                {d.date.slice(5)} · {((total) / 1000).toFixed(1)}k
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Per-family breakdown */}
                  {usageStats.by_family.length > 0 && (
                    <div>
                      <p className="text-[11px] text-sand-500 mb-2">按家人</p>
                      <div className="space-y-1.5">
                        {usageStats.by_family.map((f) => {
                          const total = f.input_tokens + f.output_tokens;
                          const allTotal = usageStats.total_input_tokens + usageStats.total_output_tokens;
                          const pct = allTotal > 0 ? (total / allTotal) * 100 : 0;
                          return (
                            <div key={f.name} className="flex items-center gap-2">
                              <span className="text-xs text-sand-600 w-12 shrink-0 truncate">{f.name}</span>
                              <div className="flex-1 bg-sand-100 rounded-full h-2 overflow-hidden">
                                <div className="bg-primary/50 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-sand-400 w-12 text-right shrink-0">{(total / 1000).toFixed(1)}k</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Family Cards: chat history + summaries ── */}
            <div className="bg-white rounded-2xl border border-sand-200/80 overflow-hidden anim-slide-up" style={{ animationDelay: "180ms" }}>
              <div className="px-5 py-4 border-b border-sand-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-primary" />
                    <h2 className="font-semibold text-sand-800 text-sm">家人动态</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={profile.summary_interval}
                      onChange={async (e) => {
                        setSavingSummary(true);
                        try {
                          await api.updateSummarySettings({ summary_interval: Number(e.target.value) });
                          refreshProfile();
                        } finally { setSavingSummary(false); }
                      }}
                      disabled={!profile.summary_enabled || savingSummary}
                      className="text-[11px] text-sand-500 bg-sand-50 border border-sand-200 rounded-lg px-2 py-1 focus:outline-none cursor-pointer disabled:opacity-50"
                    >
                      <option value={10}>每 10 条总结</option>
                      <option value={20}>每 20 条总结</option>
                      <option value={50}>每 50 条总结</option>
                    </select>
                    <button
                      onClick={async () => {
                        setSavingSummary(true);
                        try {
                          await api.updateSummarySettings({ summary_enabled: !profile.summary_enabled });
                          refreshProfile();
                        } finally { setSavingSummary(false); }
                      }}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                        profile.summary_enabled ? "bg-success" : "bg-sand-300"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        profile.summary_enabled ? "left-[18px]" : "left-0.5"
                      }`} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-sand-400 mt-1.5">
                  {profile.summary_enabled
                    ? `开启中 — AI 每和家人聊 ${profile.summary_interval} 条消息，自动生成一段对话摘要给你`
                    : "已关闭 — 开启后，AI 会定期总结和家人的聊天内容，方便你快速了解"}
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-sand-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-amber-500" />
                      <span className="text-xs font-medium text-sand-700">联网搜索</span>
                    </div>
                    <p className="text-[11px] text-sand-400 mt-0.5">
                      {profile.search_enabled
                        ? "开启中 — 家长问天气、新闻等事实性问题时，AI 会联网查找后回答（每次搜索额外消耗一次 LLM 调用）"
                        : "已关闭 — 开启后，AI 遇到不确定的事实性问题时会联网搜索，回答更准确"}
                    </p>
                    {profile.search_enabled && (
                      <p className="text-[10px] text-sand-400 mt-1">
                        本月搜索 <span className="font-medium text-sand-600">{searchStats.search_count}</span> 次
                        {searchStats.search_count > 0 && (
                          <span className="ml-2">
                            · 消耗 <span className="font-medium text-sand-600">{((searchStats.input_tokens + searchStats.output_tokens) / 1000).toFixed(1)}k</span> tokens
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      setSavingSearch(true);
                      try {
                        await api.updateSearchSettings(!profile.search_enabled);
                        refreshProfile();
                      } finally { setSavingSearch(false); }
                    }}
                    disabled={savingSearch}
                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ml-3 ${
                      profile.search_enabled ? "bg-success" : "bg-sand-300"
                    } ${savingSearch ? "opacity-50" : ""}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                      profile.search_enabled ? "left-[18px]" : "left-0.5"
                    }`} />
                  </button>
                </div>
              </div>

              {loadingBindings || loadingSummaries ? (
                <div className="px-5 py-8 flex justify-center">
                  <div className="w-5 h-5 border-2 border-sand-200 border-t-sand-400 rounded-full animate-spin" />
                </div>
              ) : activeBindings.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-sand-100 flex items-center justify-center mx-auto mb-3">
                    <Users size={20} className="text-sand-400" />
                  </div>
                  <p className="text-sm text-sand-500 font-medium">还没有绑定家人</p>
                  <p className="text-xs text-sand-400 mt-1">绑定家人后，这里会显示聊天动态和对话总结</p>
                  <button
                    onClick={() => setActivePanel("bindings")}
                    className="mt-3 text-xs text-primary hover:text-primary-dark font-medium cursor-pointer"
                  >
                    去绑定
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-sand-100">
                  {activeBindings.map((binding) => {
                    const bindingSummaries = summaries.filter((s) => s.binding_id === binding.id);
                    const latest = bindingSummaries[0];
                    const mood = latest?.mood ? MOOD_MAP[latest.mood] : null;

                    return (
                      <div key={binding.id} className="px-5 py-4">
                        {/* Family member header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-light/60 to-primary/20 flex items-center justify-center">
                              <span className="text-sm font-bold text-primary">
                                {(binding.relationship_name || "家")[0]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-sand-800">{binding.relationship_name || "家人"}</p>
                              {binding.parent_nickname && binding.parent_nickname !== binding.relationship_name && (
                                <span className="text-[11px] text-sand-400">{binding.parent_nickname}</span>
                              )}
                              {mood && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${mood.color}`}>
                                  {mood.label}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenChat(binding.id, binding.relationship_name || "家人")}
                            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-dark font-medium cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-primary-50/60 transition-colors"
                          >
                            <MessageCircle size={13} />
                            查看记录
                          </button>
                        </div>

                        {/* Latest summary */}
                        {latest ? (
                          <div className="bg-sand-50/70 rounded-xl px-3.5 py-3">
                            <p className="text-sm text-sand-700 leading-relaxed">{latest.summary}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-sand-400">
                                {new Date(latest.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="text-[10px] text-sand-300">·</span>
                              <span className="text-[10px] text-sand-400">{latest.message_count} 条消息</span>
                              {latest.topics && (
                                <>
                                  <span className="text-[10px] text-sand-300">·</span>
                                  <div className="flex gap-1 flex-wrap">
                                    {latest.topics.split(",").slice(0, 3).map((t, j) => (
                                      <span key={j} className="text-[10px] bg-primary-50 text-primary-dark px-1.5 py-0.5 rounded-full">
                                        {t.trim()}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                            {bindingSummaries.length > 1 && (
                              <details className="mt-2">
                                <summary className="text-[11px] text-sand-400 hover:text-sand-500 cursor-pointer select-none">
                                  更早的 {bindingSummaries.length - 1} 条总结
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {bindingSummaries.slice(1, 4).map((s) => (
                                    <div key={s.id} className="border-l-2 border-sand-200 pl-3 py-1">
                                      <p className="text-xs text-sand-600 leading-relaxed">{s.summary}</p>
                                      <span className="text-[10px] text-sand-400">
                                        {new Date(s.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : (
                          <div className="bg-sand-50/70 rounded-xl px-3.5 py-3 text-center">
                            <p className="text-xs text-sand-400">
                              {profile.summary_enabled
                                ? `聊满 ${profile.summary_interval} 条消息后自动生成总结`
                                : "对话总结已关闭"}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Status sidebar (desktop only) */}
          <div className="hidden lg:block w-64 shrink-0 space-y-4 anim-slide-right" style={{ animationDelay: "100ms" }}>
            {/* Profile card */}
            <div className="bg-white rounded-2xl border border-sand-200/80 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-light to-primary flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{profile.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-sand-800">{profile.name}</p>
                  <p className="text-[10px] text-sand-400">{profile.email}</p>
                </div>
              </div>
              {(profile.school || profile.city) && (
                <div className="text-xs text-sand-500 space-y-0.5 pt-2 border-t border-sand-100">
                  {profile.school && <p>{profile.school}</p>}
                  {profile.city && profile.country && <p>{profile.city}, {profile.country}</p>}
                </div>
              )}
            </div>

            {/* Status checklist */}
            <div className="bg-white rounded-2xl border border-sand-200/80 p-4">
              <h3 className="text-xs font-semibold text-sand-600 mb-3">配置状态</h3>
              <div className="space-y-2.5">
                <StatusItem done={!!profile.has_llm_key} label="AI 模型" detail={profile.llm_provider || "未配置"} />
                <StatusItem done={!!(profile.school && profile.city)} label="基本信息" detail={profile.school || "未填写"} />
                <StatusItem done={!!profile.has_fish_key} label="语音克隆" detail={profile.has_fish_key ? "已配置" : "未配置"} />
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-sand-200/80 p-4">
              <h3 className="text-xs font-semibold text-sand-600 mb-3">快捷操作</h3>
              <div className="space-y-1.5">
                <QuickAction label="添加素材" onClick={() => setActivePanel("materials")} />
                <QuickAction label="管理邀请码" onClick={() => setActivePanel("bindings")} />
                <QuickAction label="调整人格" onClick={() => setActivePanel("persona")} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over panel */}
      {activePanel && ActiveComponent && (
        <>
          <div className="fixed inset-0 z-40 bg-sand-900/10 backdrop-blur-[2px] anim-fade-in" onClick={handleClosePanel} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white border-l border-sand-200 shadow-2xl shadow-sand-900/10 overflow-y-auto anim-slide-right">
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-sand-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-sand-800 text-sm">
                {SETUP_STEPS.find((s) => s.id === activePanel)?.title ||
                  (activePanel === "notifications" ? "通知中心" : "")}
              </h2>
              <button onClick={handleClosePanel} className="text-sand-400 hover:text-sand-600 cursor-pointer p-1.5 rounded-lg hover:bg-sand-100 transition-colors btn-press">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <ActiveComponent />
            </div>
          </div>
        </>
      )}

      {/* Chat history overlay — fixed, scroll-contained */}
      {chatOverlay && (
        <>
          <div className="fixed inset-0 z-40 bg-sand-900/10 backdrop-blur-[2px] anim-fade-in" onClick={handleCloseChat} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white border-l border-sand-200 shadow-2xl shadow-sand-900/10 flex flex-col anim-slide-right">
            {/* Fixed header */}
            <div className="shrink-0 bg-white/90 backdrop-blur-md border-b border-sand-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={handleCloseChat} className="text-sand-400 hover:text-sand-600 cursor-pointer p-1 rounded-lg hover:bg-sand-100 transition-colors">
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h2 className="font-semibold text-sand-800 text-sm">和{chatOverlay.name}的聊天记录</h2>
                  <p className="text-[10px] text-sand-400">最近 50 条（只读）</p>
                </div>
              </div>
              <button onClick={handleCloseChat} className="text-sand-400 hover:text-sand-600 cursor-pointer p-1.5 rounded-lg hover:bg-sand-100 transition-colors btn-press">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable chat area */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {loadingChat ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-sand-300" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-12 text-sand-400 text-sm">
                  <MessageCircle className="w-10 h-10 mx-auto mb-3 text-sand-300" />
                  暂无聊天记录
                </div>
              ) : (
                <div className="space-y-3">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "parent" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        m.role === "parent"
                          ? "bg-sand-100 text-sand-800 rounded-tl-sm"
                          : "bg-primary/10 text-sand-800 rounded-tr-sm"
                      }`}>
                        <p>{m.content_text}</p>
                        <p className="text-[10px] text-sand-400 mt-1 text-right">
                          {new Date(m.created_at).toLocaleString("zh-CN", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-success-light" : "bg-sand-100"}`}>
        {done ? <CheckCircle2 size={12} className="text-success" /> : <div className="w-1.5 h-1.5 rounded-full bg-sand-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-sand-700">{label}</p>
        <p className={`text-[10px] truncate ${done ? "text-success" : "text-sand-400"}`}>{detail}</p>
      </div>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-sand-600 hover:bg-sand-50 hover:text-sand-800 transition-colors cursor-pointer btn-press"
    >
      {label}
      <ChevronRight size={14} className="text-sand-300" />
    </button>
  );
}
