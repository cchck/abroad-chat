"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parentApi,
  getStoredNickname,
  type ChildBinding,
} from "@/lib/parent-api";
import { Loader2, MessageCircle, UserPlus, Heart, ArrowRight } from "lucide-react";

export default function ParentPage() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBind, setShowBind] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [bindError, setBindError] = useState("");
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    setNickname(getStoredNickname() || "");
    parentApi
      .getChildren()
      .then((c) => {
        setChildren(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !nickname.trim()) return;
    setBindError("");
    setBinding(true);
    try {
      const child = await parentApi.bind(inviteCode.trim(), nickname.trim());
      setChildren((prev) => [...prev, child]);
      setShowBind(false);
      setInviteCode("");
    } catch (err: unknown) {
      setBindError(err instanceof Error ? err.message : "绑定失败");
    } finally {
      setBinding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-warm-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 border-b border-sand-200/60">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-sm">
              <Heart size={14} className="text-white fill-white" />
            </div>
            <span className="font-semibold text-sand-800 text-sm">留学分身</span>
          </div>
          <span className="text-xs text-sand-400">家长端</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6">
        {/* Welcome */}
        <div className="mb-6 anim-slide-up">
          <h1 className="text-xl font-bold text-sand-900">
            {getStoredNickname() ? `${getStoredNickname()}，你好` : "你好"}
          </h1>
          <p className="text-sand-400 text-sm mt-0.5">和孩子的分身聊聊天吧</p>
        </div>

        {/* Children list */}
        {children.length > 0 && (
          <div className="space-y-3 mb-6 anim-slide-up" style={{ animationDelay: "60ms" }}>
            {children.map((child) => (
              <button
                key={child.binding_id}
                onClick={() => router.push(`/parent/chat?id=${child.binding_id}&name=${encodeURIComponent(child.student_name)}`)}
                className="w-full bg-white rounded-2xl border border-sand-200/80 p-4 flex items-center gap-4 hover:border-sand-300 hover:shadow-sm transition-all cursor-pointer btn-press group"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-light/80 to-primary flex items-center justify-center shrink-0 shadow-sm">
                  <span className="text-white font-bold text-lg">
                    {child.student_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-sand-800">
                    {child.student_name}
                  </p>
                  <p className="text-xs text-sand-400 mt-0.5">
                    {child.relationship_name || "家人"} · 点击开始聊天
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0 group-hover:bg-warm-100 transition-colors">
                  <MessageCircle size={16} className="text-primary" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {children.length === 0 && !showBind && (
          <div className="bg-white rounded-2xl border border-sand-200/80 p-8 text-center anim-slide-up" style={{ animationDelay: "60ms" }}>
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-warm-100 to-warm-200 flex items-center justify-center mx-auto mb-4">
              <Heart size={28} className="text-primary" />
            </div>
            <h2 className="text-base font-semibold text-sand-800 mb-1.5">
              还没有绑定的孩子
            </h2>
            <p className="text-sm text-sand-400 mb-5 max-w-xs mx-auto">
              请输入孩子分享给你的邀请码，绑定后就可以和 TA 的 AI 分身聊天了
            </p>
            <button
              onClick={() => setShowBind(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-semibold hover:shadow-md hover:shadow-primary/20 transition-all cursor-pointer btn-press"
            >
              <UserPlus size={16} />
              输入邀请码
            </button>
          </div>
        )}

        {/* Add more button when already has children */}
        {children.length > 0 && !showBind && (
          <button
            onClick={() => setShowBind(true)}
            className="w-full bg-white rounded-2xl border border-dashed border-sand-300 p-4 flex items-center justify-center gap-2 text-sm text-sand-400 hover:text-primary hover:border-primary/40 hover:bg-primary-50/30 transition-all cursor-pointer btn-press anim-slide-up"
            style={{ animationDelay: "120ms" }}
          >
            <UserPlus size={16} />
            添加新的邀请码
          </button>
        )}

        {/* Bind form */}
        {showBind && (
          <div className="bg-white rounded-2xl border border-sand-200/80 overflow-hidden anim-scale-in">
            <div className="px-5 py-4 border-b border-sand-100">
              <h2 className="text-sm font-semibold text-sand-800">输入邀请码</h2>
              <p className="text-xs text-sand-400 mt-0.5">
                请向孩子索取邀请码
              </p>
            </div>

            <form onSubmit={handleBind} className="p-5 space-y-3.5">
              <div>
                <label className="block text-sm text-sand-500 mb-1.5">
                  你的称呼
                </label>
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-sand-200 text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                  placeholder="例如：妈妈、爸爸"
                />
              </div>
              <div>
                <label className="block text-sm text-sand-500 mb-1.5">
                  邀请码
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-sand-200 text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-mono tracking-widest text-center text-lg"
                  placeholder="XXXX-XXXX"
                />
              </div>

              {bindError && (
                <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">
                  {bindError}
                </p>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowBind(false);
                    setBindError("");
                  }}
                  className="flex-1 py-2.5 border border-sand-200 text-sand-500 rounded-xl text-sm font-medium hover:bg-sand-50 transition-colors cursor-pointer btn-press"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={binding}
                  className="flex-1 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-semibold hover:shadow-md hover:shadow-primary/20 transition-all disabled:opacity-50 cursor-pointer btn-press"
                >
                  {binding ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      绑定 <ArrowRight size={14} />
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer hint */}
        <p className="text-center text-[11px] text-sand-300 mt-8">
          留学分身 · AI 帮孩子陪你聊天
        </p>
      </div>
    </div>
  );
}
