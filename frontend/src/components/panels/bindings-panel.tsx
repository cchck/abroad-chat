"use client";

import { useEffect, useState } from "react";
import { api, type Binding } from "@/lib/api";
import { Plus, Loader2, Copy, Check, Users } from "lucide-react";

export default function BindingsPanel() {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [relationship, setRelationship] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const load = () => {
    api.getBindings().then((b) => { setBindings(b); setLoading(false); });
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!relationship.trim()) return;
    setCreating(true);
    try {
      await api.createInvite({ relationship_name: relationship.trim() });
      setRelationship("");
      setShowCreate(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-sand-800">家人绑定</h2>
        <p className="text-sm text-sand-400 mt-0.5">生成邀请码，让家人绑定后开始聊天</p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sand-700 text-sm">邀请码列表</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer"
        >
          <Plus size={14} />新建邀请
        </button>
      </div>

      {showCreate && (
        <div className="bg-warm-50 rounded-xl border border-warm-200 p-3.5 mb-3">
          <label className="block text-sm text-sand-600 mb-1.5">称呼（如「妈妈」「爸爸」）</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="输入称呼"
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-warm-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !relationship.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : "生成"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-sand-300" />
        </div>
      ) : bindings.length === 0 ? (
        <div className="text-center py-8 text-sand-400 text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 text-sand-300" />
          还没有邀请码，点击上方按钮创建
        </div>
      ) : (
        <div className="space-y-2">
          {bindings.map((b) => (
            <div key={b.id} className="bg-sand-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-sand-800">{b.relationship_name || "未命名"}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    b.status === "active" ? "bg-green-50 text-success" : "bg-warm-50 text-warm-600"
                  }`}>
                    {b.status === "active" ? "已绑定" : "待绑定"}
                  </span>
                </div>
                {b.parent_nickname && <p className="text-xs text-sand-400 mt-0.5">{b.parent_nickname}</p>}
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white px-2.5 py-1 rounded border border-sand-200 text-sand-600 font-mono">
                  {b.invite_code}
                </code>
                <button
                  onClick={() => handleCopy(b.invite_code, b.id)}
                  className="text-sand-400 hover:text-sand-600 cursor-pointer p-1"
                >
                  {copied === b.id ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
