/* Entry point: wire router. */
(function () {
  window.addEventListener('hashchange', UI.render);
  window.addEventListener('DOMContentLoaded', UI.render);
  if (document.readyState !== 'loading') UI.render();
})();
