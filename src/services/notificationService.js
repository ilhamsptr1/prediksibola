/**
 * notificationService.js
 * Gunakan Web Notifications API browser untuk mengirim notifikasi
 * sebelum pertandingan dimulai (H-15 menit & H-1 menit).
 */

const _timers = new Map();

export const requestPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
};

export const getPermission = () => {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
};

const sendNotification = (title, body, icon = "/favicon.ico") => {
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon, badge: "/favicon.ico" }); }
  catch (e) { console.warn("[Notification] Error:", e); }
};

export const scheduleMatchNotifications = (matches) => {
  if (Notification.permission !== "granted") return;
  cancelAllNotifications();
  const now = Date.now();
  matches.forEach(match => {
    if (match.status !== "SCHEDULED") return;
    const matchTime = new Date(match.date).getTime();
    const msTo15 = matchTime - 15 * 60 * 1000 - now;
    const msTo1  = matchTime -  1 * 60 * 1000 - now;
    const ids = [];
    if (msTo15 > 0 && msTo15 < 24 * 60 * 60 * 1000) {
      ids.push(setTimeout(() => sendNotification(
        "? Segera Dimulai!",
        `${match.homeTeam.name} vs ${match.awayTeam.name} - 15 menit lagi`,
        match.homeTeam.crest || "/favicon.ico"
      ), msTo15));
    }
    if (msTo1 > 0 && msTo1 < 24 * 60 * 60 * 1000) {
      ids.push(setTimeout(() => sendNotification(
        "?? 1 Menit Lagi!",
        `${match.homeTeam.name} vs ${match.awayTeam.name} segera kick-off!`,
        match.homeTeam.crest || "/favicon.ico"
      ), msTo1));
    }
    if (ids.length > 0) _timers.set(match.id, ids);
  });
};

export const cancelAllNotifications = () => {
  _timers.forEach(ids => ids.forEach(clearTimeout));
  _timers.clear();
};
