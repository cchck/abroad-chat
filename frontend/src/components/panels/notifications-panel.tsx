"use client";

import { useEffect, useState } from "react";
import { api, type AppNotification } from "@/lib/api";
import { Loader2, Bell, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getNotifications().then((n) => {
      setNotifications(n);
      setLoading(false);
    });
  }, []);

  const handleMarkRead = async (id: number) => {
    await api.markNotificationRead(id);
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-sand-300" /></div>;
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-sand-800">通知中心</h2>
        <p className="text-sm text-sand-400 mt-0.5">AI 遇到敏感话题或重要事项会通知你</p>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-8 text-sand-400 text-sm">
          <Bell className="w-8 h-8 mx-auto mb-2 text-sand-300" />
          暂无通知
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`rounded-xl px-4 py-3 ${n.is_read ? "bg-sand-50" : "bg-warm-50 border border-warm-200"}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {n.urgency === "urgent" ? <AlertTriangle size={16} className="text-warm-500" /> : <Bell size={16} className="text-sand-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${n.type === "sensitive_topic" ? "bg-warm-100 text-warm-700" : "bg-sand-100 text-sand-600"}`}>
                      {n.type === "sensitive_topic" ? "敏感话题" : n.type === "daily_summary" ? "每日摘要" : n.type}
                    </span>
                    <span className="text-xs text-sand-400">{new Date(n.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                  <p className="text-sm text-sand-700 whitespace-pre-wrap">{n.content}</p>
                </div>
                {!n.is_read && (
                  <button onClick={() => handleMarkRead(n.id)} className="text-sand-400 hover:text-success transition-colors cursor-pointer p-1" title="标为已读">
                    <CheckCircle2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
