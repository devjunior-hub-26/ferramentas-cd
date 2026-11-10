// Carregado no <head> de toda página de ferramenta. As ferramentas abrem dentro
// do hub, com o endereço limpo. Quem cola o endereço de uma ferramenta direto no
// navegador volta para o início e precisa fazer login.
if (window.top === window) {
  document.documentElement.style.display = 'none';
  localStorage.removeItem('cd-sessao');
  localStorage.removeItem('cd-perfil');
  location.replace(new URL('../../', document.currentScript.src).href);
}
