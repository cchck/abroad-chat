"use client";

import { useEffect, useState } from "react";
import { api, type StudentProfile } from "@/lib/api";
import { Save, Loader2 } from "lucide-react";

export default function ProfilePanel() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [form, setForm] = useState({
    name: "",
    school: "",
    city: "",
    country: "",
    timezone: "",
    major: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p);
      setForm({
        name: p.name || "",
        school: p.school || "",
        city: p.city || "",
        country: p.country || "",
        timezone: p.timezone || "",
        major: p.major || "",
      });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(form);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-sand-300" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-sand-800">个人资料</h2>
        <p className="text-sm text-sand-400 mt-0.5">
          这些信息会帮助 AI 分身更好地扮演你
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="姓名" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="学校" value={form.school} onChange={(v) => setForm({ ...form, school: v })} placeholder="如：UCLA" />
        <Field label="城市" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="如：Los Angeles" />
        <Field label="国家" value={form.country} onChange={(v) => setForm({ ...form, country: v })} placeholder="如：美国" />
        <Field label="时区" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} placeholder="如：America/Los_Angeles" />
        <Field label="专业" value={form.major} onChange={(v) => setForm({ ...form, major: v })} placeholder="如：计算机科学" />
      </div>
      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-sand-100">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          保存
        </button>
        {saved && <span className="text-sm text-success">已保存</span>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm text-sand-600 mb-1.5">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3.5 py-2.5 rounded-lg border border-sand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
    </div>
  );
}
