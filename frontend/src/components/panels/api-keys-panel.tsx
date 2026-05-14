"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type ApiKeysInfo } from "@/lib/api";
import {
  Loader2, Eye, EyeOff, ExternalLink, Mic, Link2,
  CheckCircle2, Save, Trash2, ShieldCheck,
} from "lucide-react";

const PROVIDER_GUIDES: Record<string, { name: string; url: string; steps: string[] }> = {
  anthropic: { name: "Anthropic (Claude)", url: "https://console.anthropic.com/settings/keys", steps: ["访问 console.anthropic.com", '点击左侧 "API Keys"', '点击 "Create Key"，复制生成的 Key'] },
  openai: { name: "OpenAI (GPT)", url: "https://platform.openai.com/api-keys", steps: ["访问 platform.openai.com", '进入 "API keys" 页面', '点击 "Create new secret key"，复制保存'] },
  gemini: { name: "Google Gemini", url: "https://aistudio.google.com/apikey", steps: ["访问 aistudio.google.com", '点击 "Get API key"', '选择 "Create API key"，复制保存'] },
  qwen: { name: "通义千问 (Qwen)", url: "https://dashscope.console.aliyun.com/apiKey", steps: ["访问 dashscope.console.aliyun.com", '进入 "API-KEY管理"', '点击 "创建新的API-KEY"，复制保存'] },
  deepseek: { name: "DeepSeek", url: "https://platform.deepseek.com/api_keys", steps: ["访问 platform.deepseek.com", '进入 "API keys" 页面', '点击 "Create new API key"，复制保存'] },
};

type VoiceMode = "model-id" | "upload";
type SaveState = "idle" | "saving" | "saved" | "error";

function useSaveState(): [SaveState, (s: SaveState) => void] {
  const [state, setState] = useState<SaveState>("idle");
  const set = useCallback((s: SaveState) => {
    setState(s);
    if (s === "saved" || s === "error") {
      setTimeout(() => setState("idle"), 2500);
    }
  }, []);
  return [state, set];
}

function SaveButton({ state, onClick, label = "保存" }: { state: SaveState; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={state === "saving"}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer btn-press ${
        state === "saved"
          ? "bg-success-light text-success border border-success/20"
          : state === "error"
          ? "bg-red-50 text-danger border border-danger/20"
          : "bg-primary text-white hover:bg-primary-dark"
      } disabled:opacity-60`}
    >
      {state === "saving" && <Loader2 size={13} className="animate-spin" />}
      {state === "saved" && <CheckCircle2 size={13} />}
      {state === "idle" && <Save size={13} />}
      {state === "error" && <span className="text-xs">✕</span>}
      {state === "saved" ? "已保存" : state === "error" ? "失败" : label}
    </button>
  );
}

export default function ApiKeysPanel() {
  const [info, setInfo] = useState<ApiKeysInfo | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [fishKey, setFishKey] = useState("");
  const [showLlm, setShowLlm] = useState(false);
  const [showFish, setShowFish] = useState(false);
  const [showGuide, setShowGuide] = useState<string | null>(null);

  // Individual save states
  const [llmSave, setLlmSave] = useSaveState();
  const [fishSave, setFishSave] = useSaveState();
  const [voiceSave, setVoiceSave] = useSaveState();

  // Voice model state
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [currentVoiceModelId, setCurrentVoiceModelId] = useState<string | null>(null);
  const [voiceModelId, setVoiceModelId] = useState("");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("model-id");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.getApiKeys().then((data) => {
      setInfo(data);
      setProvider(data.llm_provider || "");
      setModel(data.llm_model || "");
    });
    api.getVoiceStatus().then((v) => {
      setVoiceStatus(v?.status || null);
      if (v?.fish_audio_model_id) {
        setVoiceModelId(v.fish_audio_model_id);
        setCurrentVoiceModelId(v.fish_audio_model_id);
      }
    });
  }, []);

  // ── Save LLM config ──
  const handleSaveLlm = async () => {
    if (!provider) return;
    setLlmSave("saving");
    try {
      const update: Record<string, string> = { llm_provider: provider };
      if (model) update.llm_model = model;
      if (llmKey) update.llm_api_key = llmKey;
      const updated = await api.updateApiKeys(update);
      setInfo(updated);
      setLlmKey("");
      setLlmSave("saved");
    } catch {
      setLlmSave("error");
    }
  };

  // ── Save Fish Audio API Key ──
  const handleSaveFish = async () => {
    if (!fishKey) return;
    setFishSave("saving");
    try {
      const updated = await api.updateApiKeys({ fish_audio_api_key: fishKey });
      setInfo(updated);
      setFishKey("");
      setFishSave("saved");
    } catch {
      setFishSave("error");
    }
  };

  // ── Save Voice Model ID ──
  const handleSaveVoiceModel = async () => {
    if (!voiceModelId.trim()) return;
    setVoiceSave("saving");
    try {
      await api.setVoiceModelId(voiceModelId.trim());
      setVoiceStatus("ready");
      setCurrentVoiceModelId(voiceModelId.trim());
      setVoiceSave("saved");
    } catch {
      setVoiceSave("error");
    }
  };

  // ── Upload voice ──
  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadVoice(file);
      setVoiceStatus("ready");
      if (result.fish_audio_model_id) {
        setVoiceModelId(result.fish_audio_model_id);
        setCurrentVoiceModelId(result.fish_audio_model_id);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  // ── Clear Fish key ──
  const handleClearFish = async () => {
    if (!confirm("确定要移除 Fish Audio API Key 吗？")) return;
    setFishSave("saving");
    try {
      const updated = await api.updateApiKeys({ fish_audio_api_key: "" });
      setInfo(updated);
      setFishSave("saved");
    } catch {
      setFishSave("error");
    }
  };

  const currentProvider = info?.supported_providers.find((p) => p.id === provider);

  if (!info) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-sand-300" /></div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-sand-800">API 设置</h2>
        <p className="text-sm text-sand-400 mt-0.5">配置 AI 模型和语音服务</p>
      </div>

      {/* ═══════════ Section 1: AI Model ═══════════ */}
      <section className="bg-white rounded-xl border border-sand-200/80 overflow-hidden mb-4">
        <div className="px-4 py-3 bg-sand-50/50 border-b border-sand-100 flex items-center justify-between">
          <h3 className="font-medium text-sand-800 text-sm">AI 模型</h3>
          {info.has_llm_key && (
            <span className="flex items-center gap-1 text-[11px] text-success bg-success-light px-2 py-0.5 rounded-full">
              <ShieldCheck size={11} /> 已配置
            </span>
          )}
        </div>
        <div className="p-4 space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-xs text-sand-500 mb-1.5">模型提供商</label>
            <div className="flex gap-1.5 flex-wrap">
              {info.supported_providers.map((p) => (
                <button key={p.id} onClick={() => { setProvider(p.id); setModel(p.default_model); }}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                    provider === p.id
                      ? "border-primary bg-warm-50 text-primary-dark font-medium"
                      : "border-sand-200 text-sand-500 hover:border-sand-300"
                  }`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Guide */}
          {provider && PROVIDER_GUIDES[provider] && (
            <button
              onClick={() => setShowGuide(showGuide === provider ? null : provider)}
              className="text-xs text-primary hover:text-primary-dark flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink size={12} />如何获取 API Key？
            </button>
          )}
          {showGuide && showGuide !== "fish" && PROVIDER_GUIDES[showGuide] && (
            <div className="bg-warm-50 rounded-lg p-3 text-xs text-sand-600">
              <ol className="list-decimal list-inside space-y-0.5">
                {PROVIDER_GUIDES[showGuide].steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          {/* Model name */}
          <div>
            <label className="block text-xs text-sand-500 mb-1.5">模型名称</label>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
              placeholder={currentProvider?.default_model || "选择提供商后自动填写"}
              className="w-full px-3 py-2 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all" />
          </div>

          {/* LLM API Key */}
          <div>
            <label className="block text-xs text-sand-500 mb-1.5">API Key</label>
            <div className="relative">
              <input type={showLlm ? "text" : "password"} value={llmKey} onChange={(e) => setLlmKey(e.target.value)}
                placeholder={info.has_llm_key ? "已配置 · 留空则不修改" : "粘贴你的 API Key"}
                className="w-full px-3 py-2 pr-9 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all" />
              <button type="button" onClick={() => setShowLlm(!showLlm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sand-400 hover:text-sand-600 cursor-pointer">
                {showLlm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Save LLM */}
          <div className="flex items-center justify-end pt-1">
            <SaveButton state={llmSave} onClick={handleSaveLlm} label="保存模型配置" />
          </div>
        </div>
      </section>

      {/* ═══════════ Section 2: Fish Audio API Key ═══════════ */}
      <section className="bg-white rounded-xl border border-sand-200/80 overflow-hidden mb-4">
        <div className="px-4 py-3 bg-sand-50/50 border-b border-sand-100 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sand-800 text-sm">Fish Audio API Key</h3>
            <p className="text-[11px] text-sand-400 mt-0.5">语音合成服务，配置后 AI 可以发语音</p>
          </div>
          {info.has_fish_key && (
            <span className="flex items-center gap-1 text-[11px] text-success bg-success-light px-2 py-0.5 rounded-full">
              <ShieldCheck size={11} /> 已配置
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <button
            onClick={() => setShowGuide(showGuide === "fish" ? null : "fish")}
            className="text-xs text-primary hover:text-primary-dark flex items-center gap-1 cursor-pointer"
          >
            <ExternalLink size={12} />如何获取？
          </button>
          {showGuide === "fish" && (
            <div className="bg-warm-50 rounded-lg p-3 text-xs text-sand-600">
              <ol className="list-decimal list-inside space-y-0.5">
                <li>访问 fish.audio 注册账号</li>
                <li>进入个人中心 → API Keys</li>
                <li>创建新 Key 并复制</li>
              </ol>
            </div>
          )}

          <div className="relative">
            <input type={showFish ? "text" : "password"} value={fishKey} onChange={(e) => setFishKey(e.target.value)}
              placeholder={info.has_fish_key ? "已配置 · 留空则不修改" : "粘贴 Fish Audio API Key"}
              className="w-full px-3 py-2 pr-9 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all" />
            <button type="button" onClick={() => setShowFish(!showFish)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sand-400 hover:text-sand-600 cursor-pointer">
              {showFish ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            {info.has_fish_key ? (
              <button onClick={handleClearFish}
                className="flex items-center gap-1 text-xs text-sand-400 hover:text-danger transition-colors cursor-pointer">
                <Trash2 size={12} /> 移除
              </button>
            ) : <span />}
            <SaveButton state={fishSave} onClick={handleSaveFish} label="保存" />
          </div>
        </div>
      </section>

      {/* ═══════════ Section 3: Voice Model ═══════════ */}
      <section className="bg-white rounded-xl border border-sand-200/80 overflow-hidden">
        <div className="px-4 py-3 bg-sand-50/50 border-b border-sand-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic size={14} className="text-sand-500" />
            <h3 className="font-medium text-sand-800 text-sm">声音模型</h3>
            <span className="text-[10px] text-sand-400 bg-sand-200/60 px-1.5 py-0.5 rounded">可选</span>
          </div>
          {voiceStatus === "ready" && (
            <span className="flex items-center gap-1 text-[11px] text-success bg-success-light px-2 py-0.5 rounded-full">
              <CheckCircle2 size={11} /> 已就绪
            </span>
          )}
        </div>
        <div className="p-4">
          <p className="text-xs text-sand-400 mb-3">选择声音后，AI 回复时会用语音</p>

          {/* Current model display */}
          {currentVoiceModelId && (
            <div className="bg-success-light/50 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
              <CheckCircle2 size={13} className="text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-sand-500">当前模型</p>
                <p className="text-xs text-sand-700 font-mono truncate">{currentVoiceModelId}</p>
              </div>
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex bg-sand-50 rounded-lg border border-sand-200 p-0.5 mb-3">
            <button onClick={() => setVoiceMode("model-id")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                voiceMode === "model-id" ? "bg-primary text-white shadow-sm" : "text-sand-500 hover:text-sand-700"
              }`}>
              <Link2 size={12} /> 填写 Model ID
            </button>
            <button onClick={() => setVoiceMode("upload")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                voiceMode === "upload" ? "bg-primary text-white shadow-sm" : "text-sand-500 hover:text-sand-700"
              }`}>
              <Mic size={12} /> 上传录音克隆
            </button>
          </div>

          {voiceMode === "model-id" ? (
            <div className="space-y-2">
              <p className="text-[11px] text-sand-400">
                在 Fish Audio 选好声音后，复制 Model ID
                <a href="https://fish.audio/zh-CN/" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 ml-1 text-primary hover:underline">
                  去 Fish Audio <ExternalLink size={10} />
                </a>
              </p>
              <div className="flex gap-2">
                <input type="text" value={voiceModelId} onChange={(e) => setVoiceModelId(e.target.value)}
                  placeholder="粘贴 Model ID"
                  className="flex-1 px-3 py-2 rounded-lg border border-sand-200 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all" />
                <SaveButton state={voiceSave} onClick={handleSaveVoiceModel} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-sand-400">上传一段录音（1-3分钟），自动克隆声音</p>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-sand-50 hover:bg-sand-100 border border-sand-200 rounded-lg text-sm text-sand-700 transition-colors cursor-pointer">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                {uploading ? "克隆中..." : voiceStatus === "ready" ? "重新上传" : "上传录音"}
                <input type="file" accept="audio/*" onChange={handleVoiceUpload} className="hidden" />
              </label>
              <p className="text-[10px] text-sand-400">需要先保存 Fish Audio API Key</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
