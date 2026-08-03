import React, { useState, useEffect } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { requestPermission, getPermission, scheduleMatchNotifications, cancelAllNotifications } from "../services/notificationService";
import "./NotificationBell.css";

const NotificationBell = ({ matches = [] }) => {
  const [permission, setPermission] = useState(getPermission());
  const [showPanel, setShowPanel]   = useState(false);
  const [enabled, setEnabled]       = useState(() => localStorage.getItem("notifEnabled") === "true");

  // Jadwal ulang notifikasi saat data match berubah
  useEffect(() => {
    if (enabled && permission === "granted") {
      scheduleMatchNotifications(matches);
    }
  }, [matches, enabled, permission]);

  const toggleNotification = async () => {
    if (permission === "unsupported") return;
    if (!enabled) {
      const perm = await requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        setEnabled(true);
        localStorage.setItem("notifEnabled", "true");
        scheduleMatchNotifications(matches);
      }
    } else {
      setEnabled(false);
      localStorage.setItem("notifEnabled", "false");
      cancelAllNotifications();
    }
  };

  // Pertandingan dalam 1 jam ke depan
  const soonMatches = matches.filter(m => {
    if (m.status !== "SCHEDULED") return false;
    const diff = new Date(m.date).getTime() - Date.now();
    return diff > 0 && diff < 60 * 60 * 1000;
  });

  if (permission === "unsupported") return null;

  return (
    <div className="notif-bell-wrapper">
      <button
        className={`notif-bell-btn ${enabled ? "enabled" : ""}`}
        onClick={() => setShowPanel(p => !p)}
        title={enabled ? "Notifikasi aktif" : "Aktifkan notifikasi"}
      >
        {enabled ? <Bell size={18} /> : <BellOff size={18} />}
        {soonMatches.length > 0 && enabled && (
          <span className="notif-badge">{soonMatches.length}</span>
        )}
      </button>

      {showPanel && (
        <div className="notif-panel glass">
          <div className="notif-panel__header">
            <span><Bell size={14} /> <span>Notifikasi Pertandingan</span></span>
            <button className="notif-close" onClick={() => setShowPanel(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="notif-toggle-row">
            <span className="notif-toggle-label">
              <span>{enabled ? "Notifikasi Aktif" : "Notifikasi Nonaktif"}</span>
            </span>
            <button
              className={`notif-toggle ${enabled ? "on" : "off"}`}
              onClick={toggleNotification}
            >
              <span className="notif-toggle-knob" />
            </button>
          </div>

          {permission === "denied" && (
            <p className="notif-denied">
              <span>Izin notifikasi ditolak. Aktifkan di pengaturan browser.</span>
            </p>
          )}

          {enabled && soonMatches.length > 0 && (
            <div className="notif-soon-list">
              <div className="notif-soon-title"><span>Dalam 1 Jam:</span></div>
              {soonMatches.map(m => {
                const t = new Date(m.date);
                const timeStr = t.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={m.id} className="notif-soon-item">
                    <span className="notif-soon-time">{timeStr}</span>
                    <span className="notif-soon-match">
                      {m.homeTeam.shortName || m.homeTeam.name} vs {m.awayTeam.shortName || m.awayTeam.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {enabled && soonMatches.length === 0 && (
            <p className="notif-empty"><span>Tidak ada pertandingan dalam 1 jam ke depan.</span></p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
