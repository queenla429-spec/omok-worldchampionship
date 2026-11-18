/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const TIER_LABELS = {
    bronze: "브론즈",
    silver: "실버",
    gold: "골드",
    platinum: "플래티넘",
    diamond: "다이아",
    master: "마스터",
    challenger: "챌린저",
    champion: "챔피언"
  };

  function show(oldTierId, newTierId) {
    if (!newTierId || oldTierId === newTierId) return;
    const t = window.T || (s => s);
    const emb = (window.App && window.App.emblem) || (() => "");
    const newName = t(TIER_LABELS[newTierId] || newTierId);

    const bg = document.createElement("div");
    bg.className = "tu-bg";
    bg.innerHTML = `
      <div class="tu-card">
        <div class="tu-kicker">${t("티어가 올랐어요!")}</div>
        <div class="tu-embs">
          <div class="tu-old">${emb(oldTierId || "bronze")}</div>
          <div class="tu-arrow">→</div>
          <div class="tu-new">${emb(newTierId)}</div>
        </div>
        <div class="tu-title tier-color-${newTierId}">${t("{0} 승급", newName)}</div>
        <div class="tu-sub">${t("멋진 대국이었어요! 다음 목표도 도전해 보세요.")}</div>
        <button type="button" class="tu-ok btn primary lg">${t("좋아요!")}</button>
      </div>`;
    document.body.appendChild(bg);
    if (window.Fx && window.Fx.on()) {
      window.Fx.dim(bg, 260);
      window.Fx.lift(bg.querySelector(".tu-card"));
    }
    bg.querySelector(".tu-ok").onclick = () => bg.remove();
  }

  window.TierUp = { show };
})();
