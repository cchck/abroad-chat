"use client";

import { useEffect, useState } from "react";
import { api, type Material } from "@/lib/api";
import { Plus, Trash2, Loader2, Megaphone } from "lucide-react";

export default function MaterialsPanel() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [proactive, setProactive] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = () => {
    api.getMaterials().then((m) => { setMaterials(m); setLoading(false); });
  };
  useEffect(load, []);

  const handleAdd = async () => {
    if (!content.trim()) return;
    setAdding(true);
    try {
      await api.addMaterial({ content: content.trim(), proactive });
      setContent("");
      setProactive(false);
      load();
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteMaterial(id);
    setMaterials(materials.filter((m) => m.id !== id));
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-sand-800">素材管理</h2>
        <p className="text-sm text-sand-400 mt-0.5">告诉 AI 你最近的动态，它会在和家人聊天时自然地提起</p>
      </div>

      <div className="mb-4">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3}
          placeholder="写点什么...比如「今天考完了期中考试，感觉还不错」"
          className="w-full px-3.5 py-2.5 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none" />
        <div className="flex items-center justify-between mt-2">
          <button
            type="button"
            onClick={() => setProactive(!proactive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer select-none border ${
              proactive
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-transparent border-sand-200 text-sand-400 hover:border-sand-300 hover:text-sand-500"
            }`}
          >
            <Megaphone size={proactive ? 14 : 13} className={`transition-all duration-200 ${proactive ? "text-primary" : "text-sand-300"}`} strokeWidth={proactive ? 2.2 : 1.5} />
            <span className={`transition-all duration-200 ${proactive ? "text-sm font-medium text-primary" : "text-sm font-normal text-sand-400"}`}>
              {proactive ? "AI 会主动提起" : "AI 不会主动提起"}
            </span>
          </button>
          <button onClick={handleAdd} disabled={adding || !content.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            添加素材
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-sand-300" /></div>
      ) : materials.length === 0 ? (
        <div className="text-center py-8 text-sand-400 text-sm">还没有素材，添加一些让 AI 更了解你的近况吧</div>
      ) : (
        <div className="space-y-2">
          {materials.map((m) => (
            <div key={m.id} className="bg-sand-50 rounded-xl px-4 py-3 flex items-start gap-3 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-sand-800 whitespace-pre-wrap">{m.content}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-sand-400">{new Date(m.created_at).toLocaleDateString("zh-CN")}</span>
                  {m.proactive && <span className="text-xs text-primary flex items-center gap-1"><Megaphone size={10} />主动提起</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(m.id)} className="text-sand-300 hover:text-danger transition-colors opacity-0 group-hover:opacity-100 cursor-pointer p-1">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
