"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save, Loader2, Upload, Sparkles, Pencil } from "lucide-react";

export default function PersonaPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [catchphrases, setCatchphrases] = useState("");
  const [habits, setHabits] = useState("");
  const [tone, setTone] = useState("");
  const [parentStyles, setParentStyles] = useState("");
  const [analysisSummary, setAnalysisSummary] = useState("");

  useEffect(() => {
    api.getPersona().then((p) => {
      if (p) {
        const style = p.speaking_style || {};
        setCatchphrases(style.catchphrases || "");
        setHabits(style.habits || "");
        setTone(style.tone || "");
        const ps = p.parent_specific_styles || {};
        setParentStyles(Object.entries(ps).map(([k, v]) => `${k}：${v}`).join("\n"));
      }
      setLoading(false);
    });
  }, []);

  const handleAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setAnalysisSummary("");
    try {
      const result = await api.analyzeChatHistory(file);
      setCatchphrases(result.catchphrases || "");
      setHabits(result.habits || "");
      setTone(result.tone || "");
      setAnalysisSummary(result.sample_summary || "");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "分析失败");
    } finally {
      setAnalyzing(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parentSpecific: Record<string, string> = {};
      parentStyles.split("\n").filter(Boolean).forEach((line) => {
        const [key, ...rest] = line.split("：");
        if (key && rest.length) parentSpecific[key.trim()] = rest.join("：").trim();
      });
      await api.updatePersona({
        speaking_style: { catchphrases, habits, tone },
        chat_samples: "",
        parent_specific_styles: parentSpecific,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-sand-300" /></div>;
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-sand-800">人格配置</h2>
        <p className="text-sm text-sand-400 mt-0.5">让 AI 学会你的说话方式，聊得更像你</p>
      </div>

      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-primary" />
            <h3 className="font-medium text-sand-700 text-sm">上传聊天记录，自动分析</h3>
          </div>
          <p className="text-xs text-sand-400 mb-3">导出你和家人的微信聊天记录（txt/csv），AI 会自动提取你的说话风格</p>

          <div className="bg-sand-50 rounded-xl p-3.5 mb-3">
            <p className="text-xs font-medium text-sand-600 mb-1.5">如何导出聊天记录？</p>
            <ol className="text-xs text-sand-500 space-y-0.5 list-decimal list-inside">
              <li>下载 <a href="https://github.com/LC044/WeChatMsg" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">WeChatMsg（留痕）</a> 工具</li>
              <li>按照工具指引导出与某个家人的聊天记录（选择 txt 或 csv 格式）</li>
              <li>将导出的文件上传到下方</li>
            </ol>
          </div>

          <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${analyzing ? "bg-sand-100 text-sand-400" : "bg-primary text-white hover:bg-primary-dark"}`}>
            {analyzing ? <><Loader2 size={16} className="animate-spin" />正在分析中...</> : <><Upload size={16} />上传聊天记录</>}
            <input type="file" accept=".txt,.csv,.text" onChange={handleAnalyze} disabled={analyzing} className="hidden" />
          </label>

          {analysisSummary && (
            <div className="mt-3 bg-warm-50 rounded-lg p-3.5 text-sm text-sand-700">
              <p className="font-medium text-primary-dark mb-1">分析完成</p>
              <p>{analysisSummary}</p>
            </div>
          )}
        </div>

        <div className="border-t border-sand-100 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Pencil size={14} className="text-sand-500" />
            <h3 className="font-medium text-sand-700 text-sm">说话风格</h3>
            <span className="text-xs text-sand-400">可在分析结果基础上微调</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-sand-600 mb-1.5">口头禅 / 常用表达</label>
              <input type="text" value={catchphrases} onChange={(e) => setCatchphrases(e.target.value)} placeholder="上传聊天记录后自动提取"
                className="w-full px-3.5 py-2.5 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-sand-600 mb-1.5">说话习惯</label>
              <input type="text" value={habits} onChange={(e) => setHabits(e.target.value)} placeholder="上传聊天记录后自动提取"
                className="w-full px-3.5 py-2.5 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-sand-600 mb-1.5">整体语气</label>
              <input type="text" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="上传聊天记录后自动提取"
                className="w-full px-3.5 py-2.5 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
          </div>
        </div>

        <div className="border-t border-sand-100 pt-5">
          <h3 className="font-medium text-sand-700 text-sm mb-1">对不同长辈的风格差异</h3>
          <p className="text-xs text-sand-400 mb-2">每行一条，格式：称呼：描述</p>
          <textarea value={parentStyles} onChange={(e) => setParentStyles(e.target.value)} rows={3}
            placeholder={"妈妈：语气亲切，会撒娇\n爸爸：比较简短，偶尔开玩笑"}
            className="w-full px-3.5 py-2.5 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none" />
        </div>

        <div className="flex items-center gap-3 border-t border-sand-100 pt-4">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存配置
          </button>
          {saved && <span className="text-sm text-success">已保存</span>}
        </div>
      </div>
    </div>
  );
}
