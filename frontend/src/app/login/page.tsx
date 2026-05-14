"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isRegister) {
      if (form.password.length < 8) {
        setError("密码至少需要 8 个字符");
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
    }
    setLoading(true);
    try {
      const result = isRegister
        ? await api.register({ email: form.email, password: form.password, name: form.name })
        : await api.login({ email: form.email, password: form.password });
      localStorage.setItem("token", result.access_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <span className="text-white text-xl font-bold">分</span>
          </div>
          <h1 className="text-2xl font-bold text-sand-900 tracking-tight">留学分身</h1>
          <p className="text-sand-400 text-sm mt-1.5">AI 帮你陪父母聊天</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-sand-200/80 p-6">
          <h2 className="text-base font-semibold text-sand-800 mb-5">
            {isRegister ? "创建账号" : "欢迎回来"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <div>
                <label className="block text-sm text-sand-500 mb-1.5">姓名</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-sand-200 text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                  placeholder="你的名字"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-sand-500 mb-1.5">邮箱</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-sand-200 text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-sand-500 mb-1.5">密码</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-sand-200 text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                placeholder={isRegister ? "至少 8 个字符" : "••••••••"}
              />
            </div>
            {isRegister && (
              <div>
                <label className="block text-sm text-sand-500 mb-1.5">确认密码</label>
                <input
                  type="password"
                  required
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm bg-sand-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${
                    form.confirmPassword && form.confirmPassword !== form.password
                      ? "border-danger/50 focus:border-danger/50 focus:ring-danger/20"
                      : "border-sand-200 focus:border-primary/50"
                  }`}
                  placeholder="再输一遍密码"
                />
                {form.confirmPassword && form.confirmPassword !== form.password && (
                  <p className="text-xs text-danger mt-1">两次密码不一致</p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-semibold hover:shadow-md hover:shadow-primary/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : isRegister ? "注册" : "登录"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              className="text-sm text-sand-400 hover:text-primary transition-colors cursor-pointer"
            >
              {isRegister ? "已有账号？去登录" : "没有账号？注册一个"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
