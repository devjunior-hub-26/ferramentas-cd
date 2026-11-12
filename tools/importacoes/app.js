// Importações: a tela única onde entram todos os arquivos do sistema.
// Carregamentos (967) usam importar967.js; os relatórios da conferência usam o
// painel de conferência (../conferencia/painel.js), que grava na planilha.
import { exigirLogin } from '../../assets/js/auth.js';
import { iniciarImportacao } from './importar967.js';

const perfil = await exigirLogin(['admin']);
iniciarImportacao(perfil);

// Abre o painel de conferência direto na parte de importações
if (!/aba=importar/.test(location.hash)) history.replaceState(null, '', '#aba=importar');
await import('../conferencia/app.js');
