// Painel de pontuação da equipe de conferência (cálculos, telas e importação).
// IMPORTANTE: nomes e matrículas NÃO ficam neste código (o repositório é público);
// a equipe fica na planilha e chega pelo servidor (veja app.js).
/* ====================== REGRAS DE PONTUAÇÃO ====================== */
var FAIXAS_PADRAO = [
  {min:0,   max:99,       valor:0,    label:"Abaixo de 100", cor:"#8A97A8"},
  {min:100, max:179,      valor:1.50, label:"100 a 179",     cor:"#1C63C7"},
  {min:180, max:219,      valor:1.70, label:"180 a 219",     cor:"#17948F"},
  {min:220, max:259,      valor:2.00, label:"220 a 259",     cor:"#1E9C43"},
  {min:260, max:299,      valor:2.25, label:"260 a 299",     cor:"#7DC01B"},
  {min:300, max:349,      valor:2.50, label:"300 a 349",     cor:"#F2B21B"},
  {min:350, max:449,      valor:2.75, label:"350 a 449",     cor:"#F2811B"},
  {min:450, max:Infinity, valor:3.00, label:"450 ou mais",   cor:"#D62B24"}
];
var PALETA_FAIXA = ["#8A97A8","#1C63C7","#17948F","#1E9C43","#7DC01B","#F2B21B","#F2811B","#D62B24","#B4009E","#0EA5E9"];

/* Normaliza: ordena por mínimo, recalcula máximos (o último é infinito),
   gera rótulo e cor. Aceita min e valor; o resto é derivado. */
function normalizarFaixas(arr){
  var fs = (arr||[]).map(function(f){ return {min:Math.max(0,Math.round(Number(f.min)||0)), valor:Math.max(0,Number(f.valor)||0)}; })
    .sort(function(a,b){ return a.min-b.min; });
  if(!fs.length || fs[0].min!==0) fs.unshift({min:0, valor:0});
  /* remove mínimos duplicados mantendo o último valor informado */
  var out=[];
  fs.forEach(function(f){ if(out.length && out[out.length-1].min===f.min) out[out.length-1]=f; else out.push(f); });
  out.forEach(function(f,i){
    var isUlt = i===out.length-1;
    f.max = isUlt ? Infinity : out[i+1].min-1;
    f.cor = PALETA_FAIXA[i % PALETA_FAIXA.length];
    f.label = isUlt ? (f.min+" ou mais") : (f.min+" a "+f.max);
    if(f.min===0 && f.valor===0) f.label="Abaixo de "+(out[1]?out[1].min:60);
  });
  return out;
}
function getFaixas(){
  if(!S.config.faixas || !S.config.faixas.length) return FAIXAS_PADRAO;
  return S.config.faixas;
}
function tetoFaixas(){
  var fs=getFaixas(), ult=fs[fs.length-1];
  /* teto visual da trilha: início da última faixa + uma folga */
  return Math.max(TETO_MIN, Math.round((ult.min || 0) * 1.12));
}
var TETO_MIN = 500;

function seed(){ return []; }
/* Data de hoje pelo relógio do sistema (fuso local, não UTC) */
function hojeISO(){
  var d=new Date(), m=String(d.getMonth()+1), dia=String(d.getDate());
  return d.getFullYear()+"-"+(m.length<2?"0"+m:m)+"-"+(dia.length<2?"0"+dia:dia);
}
var CONFIG_PADRAO = {
  inicio:"2026-08-01", fim:"2026-08-31", hoje:hojeISO(),
  sabadoUtil:false, metaPadrao:0, ultimaImportacao:"", arquivo:"",
  pontosPorErro:10, pontosPorSobra:2, bonusSemErro:10, competencia:"2026-08",
  osPorPonto:25, itensPorPonto:700, pontosPorCarga:10,
  gapMin:10, durMaxOS:720
};

function cfgPadrao(){
  var c=Object.assign({},CONFIG_PADRAO);
  c.hoje = hojeISO();
  /* período padrão: o mês atual */
  var d=new Date(), ult=new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  c.competencia = c.hoje.slice(0,7);
  c.inicio = c.competencia+"-01";
  c.fim = c.competencia+"-"+String(ult).padStart(2,"0");
  return c;
}

/* ====================== ARMAZENAMENTO ====================== */
/* Os dados ficam na planilha: app.js envia ao servidor só as partes que mudaram */
function salvar(){
  if(window.salvarPainel) window.salvarPainel({conferentes:S.conferentes, config:S.config, qualidade:S.qualidade, historico:S.historico, tempos:S.tempos});
}

/* ====================== FORMATOS E DATAS ====================== */
function brl(n){ return (n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function dec(n,d){ d=(d===undefined?1:d); n=isFinite(n)?n:0;
  return n.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function inte(n){ return Math.round(n||0).toLocaleString("pt-BR"); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function pData(s){ var p=String(s||"").split("-"); return new Date(+p[0],(+p[1]||1)-1,+p[2]||1); }
function dBR(s){ if(!s) return "—"; return pData(s).toLocaleDateString("pt-BR"); }
/* Competência = ano-mês (YYYY-MM) */
var MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function competenciaDe(iso){ var m=String(iso||"").match(/^(\d{4})-(\d{2})/); return m ? m[1]+"-"+m[2] : ""; }
function compAtual(){ return S.config.competencia || competenciaDe(S.config.inicio) || ""; }
function nomeMes(comp){ var m=String(comp||"").match(/^(\d{4})-(\d{2})/); if(!m) return "—";
  return MESES[(+m[2])-1].charAt(0).toUpperCase()+MESES[(+m[2])-1].slice(1)+" de "+m[1]; }
function diasUteis(a,b,sab){
  var n=0, d=new Date(a.getTime());
  while(d<=b){ var w=d.getDay(); if(w>=1&&w<=5) n++; else if(sab&&w===6) n++; d.setDate(d.getDate()+1); }
  return n;
}
function faixaDe(p){ var F=getFaixas(); for(var i=0;i<F.length;i++){ if(p>=F[i].min&&p<=F[i].max) return F[i]; } return F[0]; }
function proxFaixa(p){ var F=getFaixas(); for(var i=0;i<F.length;i++){ if(F[i].min>p) return F[i]; } return null; }
/* Menor pontuação que já gera prêmio (início da 1ª faixa com valor > 0) */
function limiarPremio(){ var F=getFaixas(); for(var i=0;i<F.length;i++){ if(F[i].valor>0) return F[i].min; } return 0; }

/* ====================== ESTADO ====================== */
var S = { conferentes:seed(), config:cfgPadrao(), aba:"painel",
          aberto:null, sel:null, previa:null, previaQual:null, msg:null, addNovos:true, usarDatas:true,
          qualidade:{}, historico:{}, histSel:"", histConf:"__equipe", histAtual:true, paretoMet:"os",
          tempos:null, previaTempo:null, tFiltroIni:"", tFiltroFim:"", tOrdem:"pctOcioso", tSoAtivos:true, tDet:null };

/* Penalidade progressiva: 1o erro -10 pts, 2o -20, 3o -30 ... (base configuravel) */
/* ---- regras oficiais de pontuação (cartaz Santa Therezinha) ---- */
function osPorPonto(){ var v=Number(S.config.osPorPonto); return isFinite(v)&&v>0?v:25; }
function itensPorPonto(){ var v=Number(S.config.itensPorPonto); return isFinite(v)&&v>0?v:700; }
function pontosPorCarga(){ var v=Number(S.config.pontosPorCarga); return isFinite(v)&&v>0?v:10; }
function pctBonusCfg(){ var v=Number(S.config.bonusSemErro); return isFinite(v)&&v>=0?v:10; }

function pontosPorErro(){ var v=Number(S.config.pontosPorErro); return isFinite(v)&&v>0 ? v : 10; }
function pontosPorSobra(){ return 2; }   /* cada sobra abate exatamente 2 pontos do erro */
function qtdErros(c){ return Math.max(0, Math.round(Number(c.erros)||0)); }
function qtdSobras(c){ return Math.max(0, Math.round(Number(c.sobras)||0)); }
function qtdCargas(c){ return Math.max(0, Math.round(Number(c.cargas)||0)); }
/* cada carga transportada vale pontosPorCarga (10 no padrão) */
function ptsTransp(c){ return qtdCargas(c)*pontosPorCarga(); }
function penalidadeDo(i){ return pontosPorErro()*i; }              /* penalidade do i-esimo erro */
function penalidadeTotal(n){ n=Math.max(0,Math.round(Number(n)||0));
  return pontosPorErro()*n*(n+1)/2; }                              /* 10+20+30+... */

function contexto(){
  var c=S.config, ini=pData(c.inicio), fim=pData(c.fim), hoje=pData(c.hoje);
  var ontem=new Date(hoje.getTime()); ontem.setDate(ontem.getDate()-1);
  return {
    decorridos: Math.max(0, diasUteis(ini, ontem<fim?ontem:fim, c.sabadoUtil)),
    restantes:  Math.max(0, diasUteis(hoje>ini?hoje:ini, fim, c.sabadoUtil)),
    metaPadrao: Number(c.metaPadrao)||0
  };
}
function calcular(c,ctx){
  /* pontos = pontuação da conferência + pontos de transportadora, menos a penalidade dos erros.
     As sobras abatem a penalidade dos erros (não geram pontos se não houver erro). */
  var nErros = qtdErros(c), nSobras = qtdSobras(c), nCargas = qtdCargas(c), pTransp = ptsTransp(c);
  var pontosConf = Number(c.pontos)||0;
  var brutos = pontosConf + pTransp;

  var penalBruta = penalidadeTotal(nErros);
  var abatido = Math.min(nSobras*pontosPorSobra(), penalBruta);   /* sobra só abate até zerar o erro */
  var descPts = penalBruta - abatido;
  var perdaPts = Math.min(descPts, brutos);
  var pontos = Math.max(0, brutos - descPts);

  var faixaBruta = faixaDe(brutos), valorBruto = brutos*faixaBruta.valor;
  var faixa=faixaDe(pontos), prox=proxFaixa(pontos);
  var valorAtual = pontos*faixa.valor;
  /* bônus de qualidade: sem nenhum erro no período, acresce % sobre o valor a pagar */
  var pctBonus = (typeof S.config.bonusSemErro==="number") ? S.config.bonusSemErro : 10;
  var semErro = (nErros===0);
  var bonusSemErro = (semErro && valorAtual>0) ? valorAtual*(pctBonus/100) : 0;
  var valorFinal = valorAtual + bonusSemErro;

  var meta = c.meta>0 ? c.meta : (ctx.metaPadrao>0 ? ctx.metaPadrao : (prox?prox.min:pontos));
  var faixaMeta=faixaDe(meta);
  var ritmo = ctx.decorridos>0 ? pontos/ctx.decorridos : 0;
  var projecao = pontos + ritmo*ctx.restantes;
  var faltamProx = prox ? Math.max(0,prox.min-pontos) : 0;
  var faltamMeta = Math.max(0, meta-pontos);
  var fp = faixaDe(projecao);

  return Object.assign({},c,{
    pontos:pontos, pontosBrutos:brutos, pontosConf:pontosConf, transportadora:pTransp, cargas:nCargas,
    qtdErros:nErros, qtdSobras:nSobras, penalBruta:penalBruta, abatidoSobra:abatido,
    pontosDescontados:descPts, pontosPerdidos:perdaPts, proximaPenalidade:penalidadeDo(nErros+1),
    faixa:faixa, faixaBruta:faixaBruta, prox:prox,
    valorBruto:valorBruto, valorAtual:valorAtual,
    semErro:semErro, pctBonus:pctBonus, bonusSemErro:bonusSemErro, valorFinal:valorFinal,
    desconto: valorBruto-valorAtual, caiuFaixa: faixa.valor<faixaBruta.valor,
    meta:meta, faixaMeta:faixaMeta, valorMeta:meta*faixaMeta.valor,
    ritmo:ritmo, projecao:projecao, faixaProjetada:fp, valorProjetado:projecao*fp.valor,
    faltamProx:faltamProx, faltamMeta:faltamMeta,
    porDiaProx: ctx.restantes>0 ? faltamProx/ctx.restantes : Infinity,
    porDiaMeta: ctx.restantes>0 ? faltamMeta/ctx.restantes : Infinity,
    baterMeta: pontos>=meta,
    delta: typeof c.pontosAnt==="number" ? pontosConf-c.pontosAnt : null
  });
}
function linhas(){
  var ctx=contexto();
  return S.conferentes.filter(function(c){return c.ativo;})
    .map(function(c){return calcular(c,ctx);})
    .sort(function(a,b){return b.pontos-a.pontos;});
}

/* ====================== PEÇAS VISUAIS ====================== */
function chip(f){ return '<span class="chip" style="background:'+f.cor+'">'+esc(f.label)+' · '+
  (f.valor>0 ? "R$ "+dec(f.valor,2) : "sem prêmio")+'</span>'; }

function trilha(pontos,projecao,meta){
  var F=getFaixas(), TETO=tetoFaixas();
  var segs="", pos=function(v){ return Math.min(100,Math.max(0,(v/TETO)*100)); };
  F.forEach(function(f,i){
    var fim = i===F.length-1 ? TETO : f.max+1;
    segs += '<div style="width:'+(((fim-f.min)/TETO)*100)+'%;background:'+f.cor+'"></div>';
  });
  var h='<div class="trilha"><div class="rail">'+segs+'</div>';
  if(meta>0) h+='<div class="marca-meta" style="left:'+pos(meta)+'%"></div>';
  if(projecao>pontos) h+='<div class="marca-proj" style="left:'+pos(projecao)+'%"></div>';
  h+='<div class="bolha" style="left:'+pos(pontos)+'%"><i></i><em class="num">'+inte(pontos)+'</em></div>';
  return h+'</div>';
}
function dado(r,v){ return '<div><dt>'+esc(r)+'</dt><dd>'+esc(v)+'</dd></div>'; }

/* ====================== ABA PAINEL ====================== */
/* ---------- Velocímetro (gauge) de pontuação ---------- */
function polarXY(cx,cy,r,graus){
  var rad=(graus-180)*Math.PI/180;
  return {x:cx+r*Math.cos(rad), y:cy+r*Math.sin(rad)};
}
function arcoPath(cx,cy,r,g1,g2,largura){
  var p1=polarXY(cx,cy,r,g1), p2=polarXY(cx,cy,r,g2);
  var grande = (g2-g1)>180 ? 1 : 0;
  return 'M'+p1.x.toFixed(2)+','+p1.y.toFixed(2)+
         ' A'+r+','+r+' 0 '+grande+' 1 '+p2.x.toFixed(2)+','+p2.y.toFixed(2);
}
function velocimetro(l){
  var F=getFaixas(), TETO=tetoFaixas();
  var W=210, H=168, cx=105, cy=104, r=80, esp=14;
  var ang=function(v){ return Math.max(0, Math.min(180, (Math.max(0,v)/TETO)*180)); };

  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">';
  /* arcos das faixas */
  F.forEach(function(f,i){
    var g1=ang(f.min), g2=ang(i===F.length-1 ? TETO : f.max+1);
    if(g2-g1<0.4) return;
    svg += '<path d="'+arcoPath(cx,cy,r,g1,g2)+'" stroke="'+f.cor+'" stroke-width="'+esp+
      '" fill="none" opacity="'+(l.pontos>=f.min?"1":"0.28")+'"><title>'+esc(f.label)+' · R$ '+dec(f.valor,2)+'</title></path>';
  });
  /* marca da meta */
  if(l.meta>0 && l.meta<=TETO){
    var gm=ang(l.meta), a=polarXY(cx,cy,r-esp/2-2,gm), b=polarXY(cx,cy,r+esp/2+2,gm);
    svg += '<line x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+b.x.toFixed(1)+'" y2="'+b.y.toFixed(1)+
      '" stroke="#0B1F3A" stroke-width="2.5"><title>Meta '+inte(l.meta)+' pts</title></line>';
  }
  /* ponteiro */
  var gp=ang(l.pontos), pt=polarXY(cx,cy,r-esp/2-4,gp);
  svg += '<line x1="'+cx+'" y1="'+cy+'" x2="'+pt.x.toFixed(1)+'" y2="'+pt.y.toFixed(1)+
    '" stroke="#0B1F3A" stroke-width="3.2" stroke-linecap="round"/>'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="6" fill="#0B1F3A"/>'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="2.4" fill="#fff"/>';
  /* escala */
  svg += '<text x="'+(cx-r)+'" y="'+(cy+16)+'" font-size="9" fill="#94A3B8" text-anchor="middle">0</text>'+
    '<text x="'+(cx+r)+'" y="'+(cy+16)+'" font-size="9" fill="#94A3B8" text-anchor="middle">'+inte(TETO)+'</text>';
  /* número central */
  svg += '<text x="'+cx+'" y="'+(cy+42)+'" text-anchor="middle" font-size="33" font-weight="800" fill="'+l.faixa.cor+'">'+
    inte(l.pontos)+'</text>'+
    '<text x="'+cx+'" y="'+(cy+55)+'" text-anchor="middle" font-size="9.5" fill="#64748B">pontos válidos</text>';
  svg += '</svg>';
  return svg;
}

function cartaoVelocimetro(l,i){
  var pctMeta = l.meta>0 ? Math.min(100, l.pontos/l.meta*100) : 100;
  var h = '<div class="vcard'+(S.aberto===l.id?' aberto':'')+'">'+
    '<button class="vtopo" data-act="abrir" data-id="'+l.id+'">'+
      '<span class="vpos" style="background:'+l.faixa.cor+'">'+(i+1)+'</span>'+
      '<span class="vnome"><b>'+esc(l.nome)+'</b><span>Matrícula '+esc(l.matricula)+'</span></span>'+
    '</button>'+
    velocimetro(l)+
    '<div class="vfx" style="background:'+l.faixa.cor+'">'+esc(l.faixa.label)+' · R$ '+dec(l.faixa.valor,2)+'/pt</div>'+
    '<div class="vval"><b>'+brl(l.valorFinal)+'</b>'+
      (l.bonusSemErro>0?'<span class="pos-v">sem erro +'+dec(l.pctBonus,0)+'%</span>':'')+
      (l.qtdErros?'<span class="neg">'+inte(l.qtdErros)+' erro'+(l.qtdErros>1?'s':'')+' · −'+inte(l.pontosPerdidos)+' pts</span>':'')+
    '</div>'+
    '<div class="vmeta"><div class="vbar"><i style="width:'+pctMeta+'%;background:'+l.faixaMeta.cor+'"></i></div>'+
      '<span>'+(l.faltamMeta>0 ? 'faltam <b>'+inte(l.faltamMeta)+'</b> pts p/ meta '+inte(l.meta)+' ('+dec(l.porDiaMeta)+'/dia)'
                               : '<b class="pos-v">meta de '+inte(l.meta)+' pts alcançada</b>')+'</span></div>';
  if(S.aberto===l.id){
    h += '<div class="vdet"><dl>'+
      dado("Pontuação bruta", inte(l.pontosBrutos)+" pts")+
      dado("Erros / sobras", inte(l.qtdErros)+" / "+inte(l.qtdSobras)+(l.qtdErros?" · próximo tira "+inte(l.proximaPenalidade)+" pts":""))+
      dado("Pontos descontados", l.pontosDescontados ? "− "+inte(l.pontosDescontados)+" pts" : "nenhum")+
      dado("Cargas", inte(l.cargas)+(l.cargas?" · +"+inte(l.transportadora)+" pts":""))+
      dado("Valor pelos pontos", brl(l.valorAtual))+
      dado("Bônus sem erro", l.bonusSemErro>0 ? "+ "+brl(l.bonusSemErro) : "não aplicável")+
      dado("Prêmio a pagar", brl(l.valorFinal))+
      dado("Ritmo atual", dec(l.ritmo)+" pts/dia")+
      dado("Projeção fim do mês", inte(l.projecao)+" pts · "+brl(l.valorProjetado))+
      dado("Próxima faixa", l.prox ? l.prox.label+" · faltam "+inte(l.faltamProx)+" pts" : "faixa máxima")+
      dado("O.S. / unidades", inte(l.os)+" / "+inte(l.un))+
      '</dl></div>';
  }
  return h+'</div>';
}
function abaPainel(){
  var ctx=contexto(), ls=linhas(), cfg=S.config;
  var totPontos=0, totBrutos=0, totProj=0, semPremio=0, totErros=0, totPts=0, totBruto=0, totLiq=0;
  ls.forEach(function(l){ totPontos+=l.pontos; totBrutos+=l.pontosBrutos; totProj+=l.valorProjetado;
    totErros+=l.qtdErros; totPts+=l.pontosPerdidos; totBruto+=l.valorBruto; totLiq+=l.valorFinal;
    if(l.faixa.valor===0) semPremio++; });

  var h = '<div class="kpis">'+
    '<div class="kpi"><span>Conferentes ativos</span><b class="num">'+inte(ls.length)+'</b></div>'+
    '<div class="kpi"><span>Pontos válidos da equipe</span><b class="num">'+inte(totPontos)+'</b></div>'+
    '<div class="kpi'+(totErros?' alerta':'')+'"><span>Erros</span><b class="num">'+inte(totErros)+'</b></div>'+
    '<div class="kpi'+(totPts?' alerta':'')+'"><span>Pontos descontados</span><b class="num">'+(totPts?'− ':'')+inte(totPts)+'</b></div>'+
    '<div class="kpi'+((totBruto-totLiq)?' alerta':'')+'"><span>Perda em prêmio</span><b class="num">'+
      ((totBruto-totLiq)>0?'− ':'')+brl(totBruto-totLiq)+'</b></div>'+
    '<div class="kpi destaque"><span>Prêmio a pagar</span><b class="num">'+brl(totLiq)+'</b></div></div>';

  h += '<div class="faixa-info"><span>Competência <b>'+esc(nomeMes(compAtual()))+'</b></span>'+
       '<span>Período <b>'+dBR(cfg.inicio)+'</b> a <b>'+dBR(cfg.fim)+'</b></span>'+
       '<span>Posição em <b>'+dBR(cfg.hoje)+'</b></span>'+
       '<span><b>'+ctx.decorridos+'</b> dias úteis corridos · <b>'+ctx.restantes+'</b> restantes'+
       (cfg.sabadoUtil?" (sábado conta)":"")+'</span>'+
       '<span style="color:#B45309">'+semPremio+' abaixo de '+inte(limiarPremio())+' pontos</span>'+
       (cfg.ultimaImportacao ? '<span>Importado em <b>'+dBR(cfg.ultimaImportacao)+'</b>'+
          (cfg.arquivo?' · '+esc(cfg.arquivo):'')+'</span>' : '')+
       '</div>';

  h += '<div class="vgrid">';
  ls.forEach(function(l,i){ h += cartaoVelocimetro(l,i); });
  h += '</div>';

  h += '<div class="card" style="margin-top:14px"><h2 class="disp">Tabela de faixas</h2>';
  getFaixas().slice(1).forEach(function(f){
    h += '<div style="display:flex;align-items:center;gap:8px;font-size:14px;padding:2px 0">'+
      '<span style="width:12px;height:12px;border-radius:3px;background:'+f.cor+'"></span>'+
      '<span style="flex:1">'+f.label+' pontos</span>'+
      '<b class="num">R$ '+dec(f.valor,2)+'</b></div>';
  });
  h += '<p class="ajuda" style="margin-top:10px">O valor por ponto vale para toda a pontuação do mês, '+
       'não só para os pontos da faixa. Abaixo de '+inte(limiarPremio())+' pontos não há premiação.</p></div>';
  return h;
}

/* ====================== ABA CONFERENTES ====================== */
function abaConferentes(){
  var h = '<div class="card"><h2 class="disp">Adicionar conferente</h2>'+
    '<p class="ajuda">Preencha a matrícula, o nome e os números do mês (pontos, O.S. e unidades).</p>'+
    '<div class="grade">'+
      '<label class="campo"><span>Matrícula</span><input type="text" id="nMat"></label>'+
      '<label class="campo" style="grid-column:span 2"><span>Nome</span><input type="text" id="nNome"></label>'+
      '<label class="campo"><span>Pontos</span><input type="number" id="nPts"></label>'+
      '<label class="campo"><span>Qt O.S.</span><input type="number" id="nOs"></label>'+
      '<label class="campo"><span>Qt unidades</span><input type="number" id="nUn"></label>'+
      '<label class="campo"><span>Meta em pontos (opcional)</span><input type="number" id="nMeta"></label>'+
    '</div><button class="btn primario" data-act="novo">Adicionar à equipe</button>'+
    (S.msg?'<div class="aviso ok">'+esc(S.msg)+'</div>':'')+'</div>';

  h += '<h2 class="disp" style="font-size:19px;margin:18px 0 2px">Equipe ('+S.conferentes.length+')</h2>'+
       '<p class="ajuda" style="margin-bottom:10px">Toque em qualquer número para corrigir. '+
       'Desmarque para tirar alguém do painel sem apagar o cadastro.</p>';

  S.conferentes.forEach(function(c){
    h += '<div class="card" style="padding:11px">'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<input type="checkbox" data-act="ativo" data-id="'+c.id+'"'+(c.ativo?" checked":"")+' style="width:16px;height:16px">'+
        '<input type="text" data-act="upd" data-id="'+c.id+'" data-campo="nome" value="'+esc(c.nome)+'" style="flex:1;border-color:transparent;font-weight:600;padding:5px">'+
        '<button class="mini" data-act="remover" data-id="'+c.id+'">Remover</button>'+
      '</div><div class="grade4" style="margin-top:8px">'+
        '<label><span>Matrícula</span><input type="text" data-act="upd" data-id="'+c.id+'" data-campo="matricula" value="'+esc(c.matricula)+'"></label>'+
        '<label><span>Pontos</span><input type="number" data-act="upd" data-id="'+c.id+'" data-campo="pontos" value="'+c.pontos+'"></label>'+
        '<label><span>O.S.</span><input type="number" data-act="upd" data-id="'+c.id+'" data-campo="os" value="'+c.os+'"></label>'+
        '<label><span>Unidades</span><input type="number" data-act="upd" data-id="'+c.id+'" data-campo="un" value="'+c.un+'"></label>'+
      '</div></div>';
  });
  return h;
}

/* ====================== BLOCO IMPORTAR (dentro de Configuração) ====================== */
function blocoImportar(){
  var q=qualDaComp(), comps=Object.keys(S.historico||{}).sort().reverse();
  var h = '<div class="card"><h2 class="disp">Importar arquivos do sistema</h2>'+
    '<p class="ajuda">O mesmo campo aceita os dois relatórios (.xls, .xlsx ou .csv) — o painel identifica sozinho qual é:</p>'+
    '<ul style="margin:6px 0 10px;padding-left:18px;font-size:13px;color:#475569;line-height:1.6">'+
      '<li><b>Pontuação (8173)</b> — colunas MATRICULA, NOME, PONTOS, NUMERO, NUMERO2. '+
      'Do mês em apuração atualiza o painel; de outro mês vai para o <b>Histórico</b>.</li>'+
      '<li><b>Ocorrências (8630)</b> — colunas NUMOS, TEVE_OCORRENCIA, QTD_OCORRENCIAS. '+
      'Alimenta a aba <b>Qualidade</b>.</li>'+
      '<li><b>Tempos (8635)</b> — colunas CONFERENTE, NUMOS, INICIO e FIM. '+
      'Alimenta a aba <b>Tempos</b>.</li></ul>'+
    '<input type="file" accept=".xls,.xlsx,.csv" data-act="arquivo" style="font-size:13px">'+
    '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:12px;color:var(--suave)">'+
      '<span>Pontuação: '+(S.config.ultimaImportacao ? dBR(S.config.ultimaImportacao)+
        (S.config.arquivo?' · '+esc(S.config.arquivo):'') : 'nunca importada')+'</span>'+
      '<span>Qualidade: '+(q ? dBR(q.importadoEm)+' · '+esc(nomeMes(q.competencia)) : 'nunca importada')+'</span>'+
      '<span>Tempos: '+(S.tempos ? dBR(S.tempos.importadoEm)+' · '+inte(S.tempos.regs.length)+' O.S.' : 'nunca importado')+'</span>'+
      '<span>Histórico: '+(comps.length ? comps.length+' mês(es) guardado(s)' : 'vazio')+'</span></div>'+
    (S.msg && S.aba==="config" ? '<div class="aviso '+(S.msg.tipo||"ok")+'">'+esc(S.msg.texto||S.msg)+'</div>':'')+
    '</div>';

  /* ---- prévia do relatório de tempos (8635) ---- */
  var pt=S.previaTempo;
  if(pt){
    var confs={}; pt.regs.forEach(function(r){ confs[r[0]]=1; });
    h += '<div class="card"><h2 class="disp">Relatório de tempos — conferir antes de gravar</h2>'+
      '<p class="ajuda">'+esc(pt.arquivo)+' · '+inte(pt.regs.length)+' O.S. · '+
      Object.keys(confs).length+' conferentes · '+dBR(pt.inicio)+' a '+dBR(pt.fim)+'</p>'+
      '<div class="aviso ok">Ao gravar, a aba <b>Tempos</b> passa a mostrar este período. '+
      'O arquivo substitui o anterior e não altera a pontuação do painel.</div>'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button class="btn primario" data-act="gravarTempo">Gravar tempos</button>'+
      '<button class="btn" data-act="cancelarTempo">Cancelar</button></div></div>';
  }

  /* ---- prévia do relatório de ocorrências (8630) ---- */
  var pq=S.previaQual;
  if(pq){
    var tOS=0,tOc=0,tQ=0; pq.itens.forEach(function(i){ tOS+=i.osConf; tOc+=i.osOcor; tQ+=i.qtdOcor; });
    h += '<div class="card"><h2 class="disp">Relatório de ocorrências — conferir antes de gravar</h2>'+
      '<p class="ajuda">'+esc(pq.arquivo)+' · '+pq.itens.length+' conferentes'+
      (pq.inicio?' · '+dBR(pq.inicio)+' a '+dBR(pq.fim):'')+'</p>'+
      '<div class="aviso '+(pq.mesmoMes?'ok':'atencao')+'">Competência <b>'+esc(nomeMes(pq.competencia))+'</b>'+
      (pq.mesmoMes?' — mesma do painel, aparece direto na aba Qualidade.'
                 :' — diferente do painel ('+esc(nomeMes(compAtual()))+'). Fica guardada e aparece quando a competência for essa.')+
      '</div>'+
      '<div class="kpis"><div class="kpi"><span>O.S. conferidas</span><b class="num">'+inte(tOS)+'</b></div>'+
      '<div class="kpi"><span>O.S. com ocorrência</span><b class="num">'+inte(tOc)+'</b></div>'+
      '<div class="kpi"><span>Aproveitamento</span><b class="num">'+dec(tOS>0?(tOS-tOc)/tOS*100:0,2)+'%</b></div></div>'+
      '<div class="tabela-wrap"><table class="tabela tab"><thead><tr><th>Conferente</th><th class="n">O.S.</th>'+
      '<th class="n">C/ ocorrência</th><th class="n">Aproveitamento</th></tr></thead><tbody>';
    pq.itens.slice().sort(function(a,b){return aprovDe(b)-aprovDe(a);}).forEach(function(i){
      h += '<tr><td>'+esc(i.nome)+'</td><td class="n">'+inte(i.osConf)+'</td>'+
        '<td class="n">'+inte(i.osOcor)+'</td><td class="n"><b>'+dec(aprovDe(i),2)+'%</b></td></tr>';
    });
    h += '</tbody></table></div>'+
      '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button class="btn primario" data-act="gravarQual">Gravar qualidade</button>'+
      '<button class="btn" data-act="cancelarQual">Cancelar</button></div></div>';
  }

  var p=S.previa;
  if(p){
    var stCor={novo:"st-novo",atualizado:"st-atualizado",igual:"st-igual",reinicia:"st-novo",historico:"st-igual"};
    var stTxt={novo:"novo cadastro",atualizado:"atualiza",igual:"sem alteração",reinicia:"reinicia no mês",
               historico:"vai p/ histórico"};
    h += '<div class="card"><h2 class="disp">Conferir antes de gravar</h2>'+
      '<p class="ajuda">'+esc(p.arquivo)+' · '+p.linhas.length+' linhas'+
      (p.inicio?' · período '+dBR(p.inicio)+' a '+dBR(p.fim):'')+'</p>';

    /* aviso de competência / mês */
    if(p.mesmoMes){
      h += '<div class="aviso ok">Arquivo da mesma competência (<b>'+esc(nomeMes(p.competencia))+
        '</b>). Por padrão, a pontuação é <b>somada</b> ao total já registrado no mês.</div>';
    } else {
      h += '<div class="aviso atencao">Arquivo de <b>'+esc(nomeMes(p.competencia))+
        '</b>, diferente da competência do painel (<b>'+esc(nomeMes(compAtual()))+
        '</b>). Por padrão vai <b>apenas para o histórico</b>, sem alterar o painel. '+
        'Escolha "Virar o mês" só quando for realmente iniciar essa apuração.</div>';
    }

    /* seletor de modo */
    h += '<label class="campo" style="max-width:340px"><span>O que fazer com a pontuação do arquivo</span>'+
      '<select data-act="modoImport">'+
        '<option value="historico"'+(p.modo==="historico"?" selected":"")+'>Guardar apenas no histórico (não altera o painel)</option>'+
        '<option value="somar"'+(p.modo==="somar"?" selected":"")+'>Somar ao total já registrado no mês</option>'+
        '<option value="substituir"'+(p.modo==="substituir"?" selected":"")+'>Substituir pelo total do arquivo (corrigir mês)</option>'+
        '<option value="reiniciar"'+(p.modo==="reiniciar"?" selected":"")+'>Virar o mês (passa a apurar esta competência)</option>'+
      '</select></label>';

    p.linhas.forEach(function(l){
      var r=previewLinha(l,p.modo);
      h += '<div class="linha-prev"><span style="flex:1;min-width:0">'+
        '<b style="display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(l.nome)+'</b>'+
        '<span class="status '+(stCor[r.status]||"st-igual")+'">'+(stTxt[r.status]||r.status)+'</span></span>'+
        '<span class="num" style="text-align:right;font-size:14px">'+
        (r.antes!==null?'<span style="color:#94A3B8">'+inte(r.antes)+' → </span>':'')+
        '<b>'+inte(r.novo)+'</b>'+
        (r.delta?'<span style="margin-left:4px;font-size:12px;font-weight:600;color:'+(r.delta>0?"#15803D":"#B91C1C")+'">'+(r.delta>0?"+":"")+inte(r.delta)+'</span>':'')+
        '</span></div>';
    });
    if(p.modo==="historico"){
      h += '<div class="aviso neutro">Nada no painel será alterado: este mês fica guardado na aba <b>Histórico</b> '+
        'para consulta e comparação.</div>';
    } else {
      if(p.ausentes.length){
        var txtAus = p.modo==="reiniciar"
          ? "Não vieram no arquivo e começam o novo mês em zero: "
          : "Não vieram no arquivo e ficam com a pontuação anterior: ";
        h += '<div class="aviso '+(p.modo==="reiniciar"?"atencao":"neutro")+'">'+txtAus+
             esc(p.ausentes.map(function(c){return c.nome;}).join(", "))+'.</div>';
      }
      h += '<label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-top:12px">'+
        '<input type="checkbox" data-act="addNovos"'+(S.addNovos?" checked":"")+' style="width:16px;height:16px">'+
        'Cadastrar quem aparece no arquivo e ainda não está na equipe</label>';
    }
    if(p.modo==="reiniciar"){
      h += '<label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-top:4px">'+
        '<input type="checkbox" data-act="zerarErrosImp"'+(p.zerarErros?" checked":"")+' style="width:16px;height:16px">'+
        'Zerar também os erros registrados (recomeço do mês)</label>';
    }
    if(p.inicio && p.modo!=="historico"){
      h += '<label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-top:4px">'+
        '<input type="checkbox" data-act="usarDatas"'+(S.usarDatas?" checked":"")+' style="width:16px;height:16px">'+
        'Usar o período do arquivo ('+dBR(p.inicio)+' a '+dBR(p.fim)+')</label>';
    }
    h += '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button class="btn primario" data-act="gravar">'+(p.modo==="historico"?"Guardar no histórico":"Gravar atualização")+'</button>'+
      '<button class="btn" data-act="cancelar">Cancelar</button></div></div>';
  }
  return h;
}

/* ====================== ABA ACOMPANHAMENTO DE METAS ====================== */
/* Classifica o conferente pela PROJEÇÃO de fim de período (ritmo atual) contra a meta. */
function statusMeta(l){
  var meta=l.meta||0, proj=l.projecao||0;
  if(meta<=0)                 return {k:"semmeta",  label:"Sem meta",             cor:"#94A3B8", ord:5};
  if(l.pontos>=meta)          return {k:"batida",   label:"Meta alcançada",       cor:"#16A34A", ord:0};
  if(proj>=meta)              return {k:"projetada",label:"Vai alcançar (no ritmo)",cor:"#1E9C43", ord:1};
  if(proj>=meta*0.85)         return {k:"alcance",  label:"Ao alcance",           cor:"#F2B21B", ord:2};
  if(proj>=meta*0.60)         return {k:"desafio",  label:"Desafiador",           cor:"#F2811B", ord:3};
  return                              {k:"distante", label:"Distante",            cor:"#D62B24", ord:4};
}
/* Tem potencial de alcançar = vai alcançar no ritmo, ou está ao alcance com um empurrão */
function temPotencial(k){ return k==="projetada" || k==="alcance"; }

/* Sugestão de meta: a faixa que a projeção alcança (uma meta realista para o período).
   Se a projeção não chega nem na primeira faixa com prêmio, sugere essa faixa como alvo mínimo. */
function metaSugerida(l){
  var fp = l.faixaProjetada || faixaDe(l.projecao);
  if(fp.valor<=0){
    var F=getFaixas();
    for(var i=0;i<F.length;i++){ if(F[i].valor>0) return {pontos:F[i].min, faixa:F[i], alcancavel:false}; }
  }
  return {pontos:fp.min, faixa:fp, alcancavel:true};
}

function abaAcomp(){
  var ctx=contexto(), ls=linhas();
  var comMeta = ls.filter(function(l){ return (l.meta||0)>0; });
  if(!comMeta.length) return '<div class="card">Nenhuma meta definida ainda. Defina metas na aba Metas.</div>';

  var grupos={batida:[],projetada:[],alcance:[],desafio:[],distante:[]};
  comMeta.forEach(function(l){ l._st=statusMeta(l); (grupos[l._st.k]||(grupos[l._st.k]=[])).push(l); });
  Object.keys(grupos).forEach(function(k){ grupos[k].sort(function(a,b){ return (b.projecao/b.meta)-(a.projecao/a.meta); }); });

  var nBatida=grupos.batida.length, nProj=grupos.projetada.length, nAlc=grupos.alcance.length,
      nDes=grupos.desafio.length, nDist=grupos.distante.length, tot=comMeta.length;
  var nPotencial=nProj+nAlc;

  /* ---- destaque: quantos têm potencial ---- */
  var h = '<div class="card evitar-quebra"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between">'+
    '<div style="min-width:0"><h2 class="disp">Acompanhamento de metas — projeção</h2>'+
    '<p class="ajuda" style="margin-bottom:0">A projeção estima onde cada conferente fecha o período mantendo o ritmo atual '+
    '('+ctx.decorridos+' dias trabalhados · '+ctx.restantes+' restantes). '+
    'Com base nela, veja quem tem potencial de alcançar a meta.</p></div>'+
    '<div style="display:flex;gap:8px" class="no-print">'+
      '<button class="btn" data-act="imprimirAcomp" style="padding:6px 12px;font-size:12px">Imprimir</button>'+
      '<button class="btn primario" data-act="csvAcomp" style="padding:6px 12px;font-size:12px">Exportar relatório</button>'+
    '</div></div>'+
    '<div style="background:linear-gradient(135deg,#EEF6FF,#F6FEF9);border:1px solid #BFE3CC;border-radius:12px;padding:16px;margin-top:10px">'+
      '<div style="font-size:34px;font-weight:800;color:#166534;line-height:1" class="num">'+inte(nPotencial)+
      ' <span style="font-size:16px;font-weight:600;color:#475569">de '+inte(tot)+' com meta</span></div>'+
      '<div style="font-size:14px;color:#334155;margin-top:4px">conferentes com <b>potencial de alcançar a meta</b> '+
      '('+inte(nProj)+' já projetados a bater e '+inte(nAlc)+' ao alcance com um empurrão). '+
      inte(nBatida)+' já bateram.</div></div>';

  /* barra de distribuição */
  var seg=function(n,cor,rot){ return n>0 ? '<div title="'+rot+': '+n+'" style="flex:'+n+';background:'+cor+';min-width:2px"></div>' : ''; };
  h += '<div style="display:flex;height:14px;border-radius:999px;overflow:hidden;margin-top:12px;background:#E2E8F0">'+
    seg(nBatida,"#16A34A","Alcançada")+seg(nProj,"#1E9C43","Vai alcançar")+seg(nAlc,"#F2B21B","Ao alcance")+
    seg(nDes,"#F2811B","Desafiador")+seg(nDist,"#D62B24","Distante")+'</div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px">'+
    legenda("#16A34A","Alcançada",nBatida)+legenda("#1E9C43","Vai alcançar",nProj)+
    legenda("#F2B21B","Ao alcance",nAlc)+legenda("#F2811B","Desafiador",nDes)+
    legenda("#D62B24","Distante",nDist)+'</div></div>';

  /* ---- KPIs ---- */
  h += '<div class="kpis">'+
    '<div class="kpi"><span>Com meta</span><b class="num">'+inte(tot)+'</b></div>'+
    '<div class="kpi"><span>Já bateram</span><b class="num" style="color:#16A34A">'+inte(nBatida)+'</b></div>'+
    '<div class="kpi destaque"><span>Com potencial</span><b class="num">'+inte(nPotencial)+'</b></div>'+
    '<div class="kpi'+(nDist?' alerta':'')+'"><span>Distantes</span><b class="num">'+inte(nDist)+'</b></div></div>';

  /* ---- destaque dos que têm potencial (o que o usuário pediu) ---- */
  h += '<div class="card"><h2 class="disp">Quem tem potencial de alcançar a meta</h2>';
  var potenciais = grupos.projetada.concat(grupos.alcance);
  if(!potenciais.length){
    h += '<div class="aviso neutro">Nenhum conferente fora da meta está projetado para alcançá-la no ritmo atual. '+
      'Veja a seção "Desafiador" abaixo para quem ainda pode virar com aceleração.</div>';
  } else {
    h += tabelaAcomp(potenciais, ctx, true);
  }
  h += '</div>';

  /* ---- pareto ---- */
  h += blocoPareto();

  /* ---- demais grupos ---- */
  h += grupoCard("Meta já alcançada", grupos.batida, ctx, "#16A34A",
        "Prêmio da meta garantido, mantendo a pontuação.");
  h += grupoCard("Desafiador — precisa acelerar bastante", grupos.desafio, ctx, "#F2811B",
        "A projeção fica entre 60% e 85% da meta. Ainda é possível, mas exige um ritmo bem acima do atual.");
  h += grupoCard("Distante da meta", grupos.distante, ctx, "#D62B24",
        "A projeção está abaixo de 60% da meta. Dificilmente alcançável no período; foco em treinamento.");
  return h;
}

/* ====================== PARETO — QUEM SUSTENTA A OPERAÇÃO ====================== */
var METRICAS_PARETO = {
  os:     {rot:"O.S. finalizadas", campo:"os",         cor:"#0B4DA2", fmt:inte},
  pontos: {rot:"Pontos",           campo:"pontos",     cor:"#17948F", fmt:inte},
  un:     {rot:"Unidades",         campo:"un",         cor:"#7C3AED", fmt:inte}
};

/* Ordena decrescente e calcula o acumulado percentual */
function dadosPareto(metrica){
  var m=METRICAS_PARETO[metrica]||METRICAS_PARETO.os;
  var arr=linhas().map(function(l){
      return {nome:l.nome, matricula:l.matricula, valor:Math.max(0, Number(l[m.campo])||0)};
    }).filter(function(x){ return x.valor>0; })
    .sort(function(a,b){ return b.valor-a.valor; });
  var total=0; arr.forEach(function(x){ total+=x.valor; });
  var acum=0;
  arr.forEach(function(x,i){
    acum+=x.valor; x.acum=acum;
    x.pct = total>0 ? x.valor/total*100 : 0;
    x.pctAcum = total>0 ? acum/total*100 : 0;
    x.pos=i+1;
  });
  /* quantos respondem por 80% */
  var corte=0;
  for(var i=0;i<arr.length;i++){ if(arr[i].pctAcum>=80){ corte=i+1; break; } }
  if(!corte) corte=arr.length;
  return {itens:arr, total:total, corte:corte, metrica:m};
}

function graficoPareto(d){
  var arr=d.itens, m=d.metrica;
  if(!arr.length) return '<div class="aviso neutro">Sem dados para o gráfico.</div>';
  var n=arr.length;
  var L=58, R=52, T=24, B=92, W=Math.max(680, n*26+L+R), H=330;
  var iw=W-L-R, ih=H-T-B;
  var vmax=arr[0].valor||1;
  var larg=iw/n, bw=Math.min(22, larg*0.66);
  var px=function(i){ return L + larg*(i+0.5); };
  var pyB=function(v){ return T + ih - (v/vmax)*ih; };
  var pyP=function(p){ return T + ih - (p/100)*ih; };

  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">';
  /* grade + eixos */
  for(var k=0;k<=4;k++){
    var y=T+ih-(k/4)*ih;
    svg += '<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="#E8EDF3" stroke-width="1"/>'+
      '<text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#8A97A8">'+esc(m.fmt(vmax*k/4))+'</text>'+
      '<text x="'+(W-R+8)+'" y="'+(y+4)+'" font-size="11" fill="#8A97A8">'+(k*25)+'%</text>';
  }
  /* linha dos 80% */
  var y80=pyP(80);
  svg += '<line x1="'+L+'" y1="'+y80+'" x2="'+(W-R)+'" y2="'+y80+'" stroke="#D62B24" stroke-width="2" stroke-dasharray="7 4"/>'+
    '<text x="'+(W-R-4)+'" y="'+(y80-7)+'" text-anchor="end" font-size="11.5" font-weight="700" fill="#D62B24">corte 80%</text>';
  /* barras */
  arr.forEach(function(x,i){
    var xb=px(i)-bw/2, y=pyB(x.valor), alt=T+ih-y;
    var dentro = i < d.corte;
    svg += '<rect x="'+xb+'" y="'+y+'" width="'+bw+'" height="'+Math.max(1,alt)+'" rx="3" fill="'+m.cor+
      '" opacity="'+(dentro?"1":"0.34")+'"><title>'+esc(x.nome)+': '+esc(m.fmt(x.valor))+' ('+dec(x.pct,1)+'%)</title></rect>';
    if(n<=18){
      svg += '<text x="'+px(i)+'" y="'+(y-5)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="'+m.cor+'">'+
        esc(m.fmt(x.valor))+'</text>';
    }
  });
  /* linha acumulada */
  var dpath="";
  arr.forEach(function(x,i){ dpath += (i?" L":"M")+px(i)+","+pyP(x.pctAcum); });
  svg += '<path d="'+dpath+'" fill="none" stroke="#F2811B" stroke-width="2.5" stroke-linejoin="round"/>';
  arr.forEach(function(x,i){
    svg += '<circle cx="'+px(i)+'" cy="'+pyP(x.pctAcum)+'" r="3.6" fill="#fff" stroke="#F2811B" stroke-width="2"><title>'+
      esc(x.nome)+': '+dec(x.pctAcum,1)+'% acumulado</title></circle>';
  });
  /* nomes na vertical */
  arr.forEach(function(x,i){
    var prim=String(x.nome).split(" ")[0];
    svg += '<text x="'+px(i)+'" y="'+(T+ih+8)+'" font-size="10.5" fill="'+(i<d.corte?"#334155":"#94A3B8")+
      '" transform="rotate(-52 '+px(i)+','+(T+ih+8)+')" text-anchor="end">'+esc(prim)+'</text>';
  });
  svg += '</svg>';
  return svg;
}

function blocoPareto(){
  var met = S.paretoMet || "os";
  var d = dadosPareto(met), m=d.metrica;
  if(!d.itens.length) return '';
  var topo = d.itens.slice(0, d.corte);
  var pctEquipe = d.itens.length ? (d.corte/d.itens.length*100) : 0;
  var pctTopo = topo.length ? topo[topo.length-1].pctAcum : 0;

  var h = '<div class="card evitar-quebra"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between">'+
    '<div style="min-width:0"><h2 class="disp">Pareto — quem leva a operação nas costas</h2>'+
    '<p class="ajuda" style="margin-bottom:0">Barras da maior para a menor produção, com a linha do acumulado. '+
    'As barras cheias são os conferentes que somam os primeiros 80% do total.</p></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap" class="no-print">'+
      '<select data-act="paretoMet" style="width:auto;font-size:13px;padding:6px 8px">'+
        Object.keys(METRICAS_PARETO).map(function(k){
          return '<option value="'+k+'"'+(k===met?" selected":"")+'>'+esc(METRICAS_PARETO[k].rot)+'</option>'; }).join("")+
      '</select>'+
      '<button class="btn" data-act="csvPareto" style="padding:6px 12px;font-size:12px">Exportar</button>'+
    '</div></div>';

  /* destaque */
  h += '<div style="background:linear-gradient(135deg,#FFF7ED,#EEF6FF);border:1px solid #FED7AA;border-radius:12px;padding:16px;margin-top:10px">'+
    '<div style="font-size:32px;font-weight:800;color:#9A3412;line-height:1" class="num">'+inte(d.corte)+
    ' <span style="font-size:16px;font-weight:600;color:#475569">de '+inte(d.itens.length)+' conferentes</span></div>'+
    '<div style="font-size:14px;color:#334155;margin-top:4px">respondem por <b>'+dec(pctTopo,1)+'%</b> de '+
    esc(m.rot.toLowerCase())+' da operação — ou seja, <b>'+dec(pctEquipe,0)+'% da equipe</b> sustenta a maior parte do trabalho. '+
    'Total do período: <b>'+esc(m.fmt(d.total))+'</b>.</div></div>';

  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#475569;margin:10px 0 4px">'+
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:10px;border-radius:2px;background:'+m.cor+'"></span>'+esc(m.rot)+' (dentro dos 80%)</span>'+
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:10px;border-radius:2px;background:'+m.cor+';opacity:.34"></span>demais</span>'+
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:16px;height:3px;border-radius:2px;background:#F2811B"></span>acumulado</span>'+
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:16px;height:0;border-top:3px dashed #D62B24"></span>corte de 80%</span></div>'+
    '<div class="rolar">'+graficoPareto(d)+'</div>';

  /* tabela */
  h += '<div class="tabela-wrap" style="margin-top:12px"><table class="tabela tab"><thead><tr>'+
    '<th>#</th><th>Conferente</th><th class="n">'+esc(m.rot)+'</th><th class="n">% do total</th>'+
    '<th class="n">Acumulado</th><th class="n">Por dia útil</th></tr></thead><tbody>';
  var diasU = Math.max(1, contexto().decorridos);
  d.itens.forEach(function(x,i){
    var dentro=i<d.corte;
    h += '<tr'+(dentro?' style="background:#FFFBF5"':'')+'>'+
      '<td class="num" style="color:var(--suave)">'+x.pos+'</td>'+
      '<td><b>'+esc(x.nome)+'</b>'+(dentro?'<span class="selo" style="background:#FFEDD5;color:#9A3412;margin-left:6px">80%</span>':'')+'</td>'+
      '<td class="n"><b>'+esc(m.fmt(x.valor))+'</b></td>'+
      '<td class="n">'+dec(x.pct,1)+'%</td>'+
      '<td class="n">'+dec(x.pctAcum,1)+'%'+
        '<div style="height:4px;border-radius:999px;background:#E2E8F0;margin-top:3px;overflow:hidden">'+
        '<i style="display:block;height:100%;width:'+Math.min(100,x.pctAcum)+'%;background:'+(dentro?"#F2811B":"#CBD5E1")+'"></i></div></td>'+
      '<td class="n" style="font-size:12px;color:#475569">'+dec(x.valor/diasU,1)+'</td></tr>';
  });
  h += '</tbody></table></div>'+
    '<p class="ajuda" style="margin-top:10px">Leitura: se poucos conferentes concentram a maior parte da produção, '+
    'a operação depende demais deles — vale distribuir melhor a carga ou treinar quem está na cauda.</p></div>';
  return h;
}

function baixarCSVPareto(){
  var met=S.paretoMet||"os", d=dadosPareto(met), m=d.metrica;
  var linhasCsv=[["Posicao","Conferente","Matricula",m.rot,"Percentual do total","Acumulado","Dentro dos 80%"]];
  d.itens.forEach(function(x,i){
    linhasCsv.push([x.pos,x.nome,x.matricula,x.valor,dec(x.pct,2)+"%",dec(x.pctAcum,2)+"%",(i<d.corte?"Sim":"Nao")]);
  });
  linhasCsv.push(["","TOTAL","",d.total,"100%","",""]);
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var t=String(c); return /[;"\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url; a.download="pareto-"+met+".csv"; a.click();
  URL.revokeObjectURL(url);
}
function legenda(cor,rot,n){
  return '<span style="display:inline-flex;align-items:center;gap:5px">'+
    '<span style="width:11px;height:11px;border-radius:3px;background:'+cor+'"></span>'+
    esc(rot)+' <b class="num">'+inte(n)+'</b></span>';
}

function tabelaAcomp(arr, ctx, comAcelera){
  var h='<div class="tabela-wrap"><table class="tabela tab"><thead><tr>'+
    '<th>Conferente</th><th class="n">Hoje</th><th class="n">Meta</th><th class="n">Projeção</th>'+
    '<th class="n">Faltam</th><th class="n">Ritmo</th><th class="n">Precisa</th>'+
    '<th class="n">Meta sugerida</th>'+(comAcelera?'<th class="n">Situação</th>':'<th></th>')+'</tr></thead><tbody>';
  arr.forEach(function(l){
    var st=l._st||statusMeta(l);
    var precisa = l.faltamMeta>0 ? dec(l.porDiaMeta)+'/dia' : '—';
    var acel = "";
    if(l.faltamMeta>0 && l.ritmo>0){
      var razao=l.porDiaMeta/l.ritmo;
      acel = razao<=1 ? "no ritmo" : ("+"+Math.round((razao-1)*100)+"% de ritmo");
    } else if(l.faltamMeta>0 && l.ritmo<=0){ acel="sem ritmo ainda"; }
    else acel="alcançada";
    var ms=metaSugerida(l);
    var msHtml = '<b>'+inte(ms.pontos)+'</b> pts<div style="font-size:10px;color:'+ms.faixa.cor+';font-weight:600">'+
      (ms.faixa.valor>0 ? 'R$ '+dec(ms.faixa.valor,2)+'/pt'+(ms.alcancavel?'':' · a mirar') : 'sem prêmio')+'</div>';
    h += '<tr>'+
      '<td><b>'+esc(l.nome)+'</b></td>'+
      '<td class="n">'+inte(l.pontos)+'</td>'+
      '<td class="n">'+inte(l.meta)+'</td>'+
      '<td class="n"><b>'+inte(l.projecao)+'</b></td>'+
      '<td class="n">'+(l.faltamMeta>0?inte(l.faltamMeta):'—')+'</td>'+
      '<td class="n">'+dec(l.ritmo)+'</td>'+
      '<td class="n">'+precisa+'</td>'+
      '<td class="n">'+msHtml+'</td>'+
      '<td class="n"><span class="selo" style="background:'+st.cor+'22;color:'+st.cor+'">'+
        (comAcelera?esc(acel):esc(st.label))+'</span></td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}

function grupoCard(titulo, arr, ctx, cor, desc){
  if(!arr.length) return "";
  var h='<div class="card"><h2 class="disp" style="color:'+cor+'">'+esc(titulo)+' · '+arr.length+'</h2>'+
    '<p class="ajuda">'+esc(desc)+'</p>'+tabelaAcomp(arr, ctx, false)+'</div>';
  return h;
}

function baixarCSVAcomp(){
  var ctx=contexto();
  var ls=linhas().filter(function(l){ return (l.meta||0)>0; })
    .map(function(l){ l._st=statusMeta(l); return l; })
    .sort(function(a,b){ return a._st.ord-b._st.ord || (b.projecao/b.meta)-(a.projecao/a.meta); });
  var cab=["Situacao","Conferente","Matricula","Pontos hoje","Meta","Projecao fim periodo",
    "Faltam p/ meta","Ritmo atual (pts/dia)","Ritmo necessario (pts/dia)","Aceleracao necessaria",
    "Tem potencial","Meta sugerida (pts)","Meta sugerida (faixa)","Meta sugerida (R$/ponto)",
    "Faixa projetada","Premio projetado","Premio da meta"];
  var linhasCsv=[cab];
  ls.forEach(function(l){
    var acel="";
    if(l.faltamMeta>0 && l.ritmo>0){ var r=l.porDiaMeta/l.ritmo; acel = r<=1 ? "no ritmo" : ("+"+Math.round((r-1)*100)+"%"); }
    else if(l.faltamMeta>0){ acel="sem ritmo ainda"; } else { acel="alcancada"; }
    var ms=metaSugerida(l);
    linhasCsv.push([
      l._st.label, l.nome, l.matricula, l.pontos, l.meta, Math.round(l.projecao),
      l.faltamMeta>0?l.faltamMeta:0, dec(l.ritmo), l.faltamMeta>0?dec(l.porDiaMeta):"0",
      acel, temPotencial(l._st.k)?"Sim":(l._st.k==="batida"?"Alcancada":"Nao"),
      ms.pontos, ms.faixa.label+(ms.alcancavel?"":" (a mirar)"), dec(ms.faixa.valor,2),
      l.faixaProjetada.label, dec(l.valorProjetado,2), dec(l.valorMeta,2)
    ]);
  });
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var s=String(c); return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url;
  a.download="acompanhamento-metas-"+(compAtual()||"periodo")+".csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ====================== ABA METAS ====================== */
function abaMetas(){
  var ctx=contexto(), ls=linhas();
  var h = '<div class="card"><h2 class="disp">Como a meta é definida</h2>'+
    '<p class="ajuda">Sem meta cadastrada, o painel usa a próxima faixa do colaborador como alvo. '+
    'Você pode fixar uma meta igual para todos ou digitar uma meta individual abaixo.</p>'+
    '<label class="campo" style="max-width:280px"><span>Meta padrão da equipe em pontos (0 = usar a próxima faixa)</span>'+
    '<input type="number" data-act="metaPadrao" value="'+S.config.metaPadrao+'"></label><div class="pilulas">';
  [100,150,180,240,350,450].forEach(function(v){ h+='<button data-act="metaRapida" data-v="'+v+'">'+v+' pts</button>'; });
  h += '<button data-act="metaRapida" data-v="0">próxima faixa</button></div></div>';

  ls.forEach(function(l){
    h += '<div class="card" style="padding:12px">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">'+
        '<div style="min-width:0"><b style="font-size:14px">'+esc(l.nome)+'</b>'+
        '<div class="num" style="font-size:12px;color:var(--suave)">'+inte(l.pontos)+' pts hoje · '+
        esc(l.faixa.label)+' · '+brl(l.valorAtual)+'</div></div>'+
        '<label style="text-align:right;flex:none"><span style="display:block;font-size:11px;color:var(--suave)">Meta individual</span>'+
        '<input type="number" data-act="upd" data-id="'+l.id+'" data-campo="meta" value="'+l.meta+'" style="width:96px;text-align:right"></label>'+
      '</div>';
    if(l.baterMeta){
      h += '<div class="aviso ok" style="margin-top:8px">Meta de '+inte(l.meta)+' pontos já alcançada — prêmio de '+
        brl(l.valorMeta)+' garantido na faixa '+esc(l.faixaMeta.label)+'.</div>';
    } else {
      h += '<div class="aviso neutro" style="margin-top:8px">Faltam <b class="num">'+inte(l.faltamMeta)+
        '</b> pontos em <b class="num">'+ctx.restantes+'</b> dias úteis: <b class="num" style="color:'+l.faixaMeta.cor+
        '">'+dec(l.porDiaMeta)+' pontos por dia</b>. Ritmo atual: <b class="num">'+dec(l.ritmo)+
        '</b>/dia. A meta paga '+brl(l.valorMeta)+' contra '+brl(l.valorAtual)+' de hoje.</div>';
    }
    h += '</div>';
  });
  return h;
}

/* ====================== ABA ERROS ====================== */
function avisoMsg(){
  if(!S.msg) return "";
  var t = (typeof S.msg==="string") ? {tipo:"ok",texto:S.msg} : S.msg;
  return '<div class="aviso '+(t.tipo||"ok")+'">'+esc(t.texto||"")+'</div>';
}

function abaLancamentos(){
  var cfg=S.config, base=pontosPorErro(), ls=linhas();
  var q=qualDaComp(), temSobraArq = !!(q && q.temSobras);
  var totErros=0, totSobras=0, totTransp=0, totCargas=0, totPts=0, totConf=0, totBruto=0, totLiq=0, totBonus=0, nSemErro=0;
  ls.forEach(function(l){ totErros+=l.qtdErros; totSobras+=l.qtdSobras; totTransp+=l.transportadora; totCargas+=l.cargas;
    totPts+=l.pontosPerdidos; totConf+=l.pontosConf; totBruto+=l.valorBruto; totLiq+=l.valorFinal;
    totBonus+=l.bonusSemErro; if(l.semErro) nSemErro++; });
  var pctB = (typeof cfg.bonusSemErro==="number") ? cfg.bonusSemErro : 10;

  /* ---- regras ---- */
  var h = '<div class="card"><h2 class="disp">Erros, sobras e transportadora</h2>'+
    '<p class="ajuda">Tudo o que altera a pontuação do mês em um só lugar. '+
    'Os pontos de <b>transportadora somam</b> à conferência; cada <b>erro</b> desconta pontos de forma crescente '+
    '('+inte(base)+', '+inte(base*2)+', '+inte(base*3)+'…); cada <b>sobra</b> abate 2 pontos da penalidade dos erros, '+
    'sem nunca virar ponto extra. Quem fecha o período <b>sem nenhum erro</b> recebe <b>+'+dec(pctB,0)+
    '%</b> sobre o valor a pagar.</p>'+
    '<div class="grade">'+
      '<label class="campo"><span>Pontos descontados no 1º erro</span>'+
        '<input type="number" min="1" step="1" data-act="ptsErro" value="'+base+'"></label>'+
      '<label class="campo"><span>Bônus sem nenhum erro (%)</span>'+
        '<input type="number" min="0" step="1" data-act="pctBonus" value="'+pctB+'"></label>'+
    '</div>'+
    '<div class="tabela-wrap" style="margin-top:4px"><table class="tabela tab"><thead><tr><th>Erro</th>';
  for(var i=1;i<=6;i++) h += '<th class="n">'+i+'º</th>';
  h += '</tr></thead><tbody><tr><td>Desconta</td>';
  for(i=1;i<=6;i++) h += '<td class="n neg">− '+inte(penalidadeDo(i))+'</td>';
  h += '</tr><tr><td>Acumulado</td>';
  for(i=1;i<=6;i++) h += '<td class="n"><b>− '+inte(penalidadeTotal(i))+'</b></td>';
  h += '</tr></tbody></table></div>';

  h += '<div class="aviso '+(temSobraArq?'ok':'neutro')+'" style="margin-top:10px">'+
    (temSobraArq
      ? 'Sobras preenchidas automaticamente pelo relatório 8630 de '+esc(nomeMes(q.competencia))+
        ' (contagem de O.S. distintas com status de sobra). Você ainda pode ajustar manualmente.'
      : 'As sobras podem vir automáticas do relatório 8630, desde que o arquivo traga uma coluna de '+
        '<b>tipo/status da ocorrência</b> (com o valor SOBRA). O arquivo importado não tem essa coluna, '+
        'então as sobras seguem em preenchimento manual.')+'</div>'+
    avisoMsg()+'</div>';

  /* ---- KPIs ---- */
  h += '<div class="kpis">'+
    '<div class="kpi"><span>Cargas ('+inte(pontosPorCarga())+' pts cada)</span>'+
      '<b class="num" style="color:#166534">'+inte(totCargas)+' → +'+inte(totTransp)+'</b></div>'+
    '<div class="kpi'+(totErros?' alerta':'')+'"><span>Erros</span><b class="num">'+inte(totErros)+'</b></div>'+
    '<div class="kpi"><span>Sobras</span><b class="num">'+inte(totSobras)+'</b></div>'+
    '<div class="kpi'+(totPts?' alerta':'')+'"><span>Pontos descontados</span><b class="num">'+(totPts?'− ':'')+inte(totPts)+'</b></div>'+
    '<div class="kpi" style="border-color:#86EFAC;background:#F6FEF9"><span>Bônus sem erro ('+inte(nSemErro)+')</span>'+
      '<b class="num" style="color:#166534">+'+brl(totBonus)+'</b></div>'+
    '<div class="kpi destaque"><span>Prêmio a pagar</span><b class="num">'+brl(totLiq)+'</b></div></div>';

  /* ---- tabela única ---- */
  h += '<div class="card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;justify-content:space-between">'+
    '<div><h2 class="disp">Lançamentos por conferente</h2>'+
    '<p class="ajuda" style="margin-bottom:0">Digite nos campos em azul. O cálculo é feito na hora.</p></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap" class="no-print">'+
      '<button class="btn" data-act="csvLanc" style="padding:6px 12px;font-size:12px">Baixar CSV</button>'+
      '<button class="btn perigo" data-act="zerarLanc" style="padding:6px 12px;font-size:12px">Zerar lançamentos</button>'+
    '</div></div>';

  h += '<div class="tabela-wrap" style="margin-top:10px"><table class="tabela tab"><thead><tr>'+
    '<th>Conferente</th><th class="n">Conferência</th>'+
    '<th class="n" style="width:74px">Cargas</th><th class="n">Transp. (pts)</th><th class="n">Pontos totais</th>'+
    '<th class="n" style="width:62px">Erros</th><th class="n" style="width:62px">Sobras</th>'+
    '<th class="n">Desconto</th><th class="n">Pontos válidos</th>'+
    '<th class="n">Faixa</th><th class="n">Bônus</th><th class="n">Prêmio a pagar</th></tr></thead><tbody>';
  ls.forEach(function(l){
    var det = l.qtdErros
      ? (l.abatidoSobra>0 ? 'penalidade '+inte(l.penalBruta)+' − '+inte(l.abatidoSobra)+' (sobra)'
                          : 'próximo erro tira '+inte(l.proximaPenalidade)+' pts')
      : (l.qtdSobras ? 'sem erro — sobra não pontua' : '');
    h += '<tr'+(l.qtdErros?' style="background:#FEF7F7"':'')+'>'+
      '<td><b>'+esc(l.nome)+'</b>'+(det?'<div style="font-size:11px;color:var(--suave)">'+det+'</div>':'')+'</td>'+
      '<td class="n">'+inte(l.pontosConf)+'</td>'+
      '<td class="n"><input type="number" min="0" step="1" data-act="upd" data-id="'+l.id+'" data-campo="cargas" '+
        'value="'+(l.cargas||0)+'" style="width:100%;text-align:right;padding:5px 6px"></td>'+
      '<td class="n'+(l.transportadora?' pos-v':'')+'">'+(l.transportadora?'+'+inte(l.transportadora):'—')+'</td>'+
      '<td class="n"><b>'+inte(l.pontosBrutos)+'</b></td>'+
      '<td class="n"><input type="number" min="0" step="1" data-act="upd" data-id="'+l.id+'" data-campo="erros" '+
        'value="'+(l.erros||0)+'" style="width:100%;text-align:right;padding:5px 6px"></td>'+
      '<td class="n"><input type="number" min="0" step="1" data-act="upd" data-id="'+l.id+'" data-campo="sobras" '+
        'value="'+(l.sobras||0)+'" style="width:100%;text-align:right;padding:5px 6px"'+
        (temSobraArq?' title="Preenchido pelo relatório 8630"':'')+'></td>'+
      '<td class="n'+(l.pontosDescontados?' neg':'')+'">'+(l.pontosDescontados?'− '+inte(l.pontosDescontados):'—')+
        (l.abatidoSobra>0?'<div style="font-size:10px;font-weight:600;color:#15803D">sobra −'+inte(l.abatidoSobra)+'</div>':'')+'</td>'+
      '<td class="n"><b>'+inte(l.pontos)+'</b></td>'+
      '<td class="n" style="font-size:11px">'+
        (l.caiuFaixa ? '<span style="color:var(--suave);text-decoration:line-through">R$ '+dec(l.faixaBruta.valor,2)+
          '</span> <b class="neg">R$ '+dec(l.faixa.valor,2)+'</b>' : 'R$ '+dec(l.faixa.valor,2))+'</td>'+
      '<td class="n">'+(l.bonusSemErro>0
          ? '<b class="pos-v">+'+brl(l.bonusSemErro)+'</b><div style="font-size:10px;color:#15803D">sem erro +'+dec(l.pctBonus,0)+'%</div>'
          : '<span style="color:var(--suave)">—</span>')+'</td>'+
      '<td class="n"><b>'+brl(l.valorFinal)+'</b>'+
        (l.desconto>0?'<div style="font-size:10px;font-weight:600;color:#B91C1C">− '+brl(l.desconto)+'</div>':'')+'</td></tr>';
  });
  h += '<tr style="background:#F8FAFC"><td><b>Total</b></td><td class="n"><b>'+inte(totConf)+'</b></td>'+
    '<td class="n"><b>'+inte(totCargas)+'</b></td><td class="n pos-v"><b>+'+inte(totTransp)+'</b></td>'+
    '<td class="n"><b>'+inte(totConf+totTransp)+'</b></td>'+
    '<td class="n"><b>'+inte(totErros)+'</b></td><td class="n"><b>'+inte(totSobras)+'</b></td>'+
    '<td class="n neg"><b>'+(totPts?'− '+inte(totPts):'—')+'</b></td><td></td><td></td>'+
    '<td class="n pos-v"><b>+'+brl(totBonus)+'</b></td>'+
    '<td class="n"><b>'+brl(totLiq)+'</b></td></tr></tbody></table></div>'+
    '<p class="ajuda" style="margin-top:10px">Ordem do cálculo: conferência + transportadora = pontos totais; '+
    'a penalidade dos erros (já abatida pelas sobras) incide sobre esse total; a faixa vale sobre os pontos válidos; '+
    'e quem fica com zero erro ganha +'+dec(pctB,0)+'% no fim. Uma sobra que zera a penalidade não devolve o bônus: '+
    'ele exige nenhum erro registrado.</p></div>';
  return h;
}

function baixarCSVLanc(){
  var linhasCsv=[["Matricula","Conferente","Pontos conferencia","Cargas","Transportadora (pts)","Pontos totais",
    "Erros","Sobras","Abatido sobra","Pontos descontados","Pontos validos","Faixa","R$/ponto",
    "Premio sem erros","Valor por pontos","Bonus sem erro","Premio a pagar","Perda"]];
  linhas().forEach(function(l){
    linhasCsv.push([l.matricula,l.nome,l.pontosConf,l.cargas,l.transportadora,l.pontosBrutos,
      l.qtdErros,l.qtdSobras,l.abatidoSobra,l.pontosDescontados,l.pontos,
      l.faixa.label,dec(l.faixa.valor,2),dec(l.valorBruto,2),dec(l.valorAtual,2),
      dec(l.bonusSemErro,2),dec(l.valorFinal,2),dec(l.desconto,2)]);
  });
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var t=String(c); return /[;"\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url; a.download="lancamentos-conferencia.csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ====================== ABA FEEDBACK ====================== */
function abaFeedback(){
  var ctx=contexto(), ls=linhas(), cfg=S.config;
  if(!ls.length) return '<div class="card">Cadastre um conferente para gerar o termo.</div>';

  /* modo imprimir todos: gera um termo por conferente, cada um em sua página */
  if(S.imprimirTodos){
    var todos = ls.map(function(x,i){
      return '<div'+(i>0?' class="quebra-pagina"':'')+'>'+termoFeedbackHTML(x,ctx,cfg)+'</div>';
    }).join("");
    return '<div class="card no-print"><div class="aviso neutro">Preparando '+ls.length+
      ' termos para impressão…</div></div>'+todos;
  }

  var l = null;
  for(var i=0;i<ls.length;i++){ if(ls[i].id===S.sel) l=ls[i]; }
  if(!l) l=ls[0];

  var h = '<div class="card no-print"><h2 class="disp">'+esc(l.nome)+'</h2>'+
    '<label class="campo"><span>Observações do líder (entram no termo)</span>'+
    '<textarea rows="3" data-act="upd" data-id="'+l.id+'" data-campo="obs" placeholder="Pontos fortes, ajustes combinados, apoio necessário…">'+esc(l.obs)+'</textarea></label>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" data-act="imprimir">Imprimir termo</button>'+
    '<button class="btn" data-act="imprimirTodos">Imprimir todos os feedbacks</button>'+
    '<button class="btn" data-act="copiar">Copiar texto</button></div>'+
    (S.msg?'<div class="aviso ok">'+esc(S.msg)+'</div>':'')+'</div>';

  h += termoFeedbackHTML(l,ctx,cfg);
  return h;
}

/* Monta o termo de feedback de um conferente (usado na tela e na impressão em lote) */
function termoFeedbackHTML(l,ctx,cfg){
  var pctB=pctBonusCfg(), pot=potencialLinha(l), qc=qualDoConf(l);

  /* ---------- cabeçalho ---------- */
  var h = '<div class="card termo termo-c">'+
    '<div class="t-cab">'+
      '<div><p class="t-marca">Santa Therezinha · Equipe de conferência</p>'+
      '<h2 class="disp t-titulo">Termo de feedback de produtividade</h2></div>'+
      '<div class="t-per"><span>'+esc(nomeMes(compAtual()))+'</span><b>'+dBR(cfg.inicio)+' a '+dBR(cfg.fim)+'</b></div>'+
    '</div>'+
    '<div class="t-ident">'+
      '<span><small>Colaborador</small><b>'+esc(l.nome)+'</b></span>'+
      '<span><small>Matrícula</small><b>'+esc(l.matricula)+'</b></span>'+
      '<span><small>Função</small><b>Conferente</b></span>'+
      '<span><small>Posição em</small><b>'+dBR(cfg.hoje)+'</b></span>'+
      '<span><small>Dias úteis restantes</small><b>'+inte(ctx.restantes)+'</b></span>'+
    '</div>'+
    '<div class="no-print">'+trilha(l.pontos,l.projecao,l.meta)+'</div>';

  /* ---------- caixas compactas: hoje | meta | potencial ---------- */
  h += '<div class="cx">'+
    '<div class="cx-b"><small>Situação de hoje</small>'+
      '<b class="num">'+inte(l.pontos)+'<i>pts</i></b>'+
      '<span class="cx-t" style="background:'+l.faixa.cor+'">'+esc(l.faixa.label)+' · R$ '+dec(l.faixa.valor,2)+'</span>'+
      '<em class="num">'+brl(l.valorFinal)+(l.bonusSemErro>0?' <b class="pos-v">(+'+dec(pctB,0)+'%)</b>':'')+'</em></div>'+
    '<div class="cx-b meta"><small>Meta acordada</small>'+
      '<b class="num">'+inte(l.meta)+'<i>pts</i></b>'+
      '<span class="cx-t" style="background:'+l.faixaMeta.cor+'">'+esc(l.faixaMeta.label)+' · R$ '+dec(l.faixaMeta.valor,2)+'</span>'+
      '<em class="num">'+brl(l.valorMeta)+'</em></div>'+
    (pot ? '<div class="cx-b pot"><small>Potencial · '+esc(mesCurto(pot.comp))+'</small>'+
      '<b class="num">'+inte(pot.pontos)+'<i>pts</i></b>'+
      '<span class="cx-t" style="background:#7C3AED">'+dec(pot.pontos>0?l.pontos/pot.pontos*100:0,0)+'% atingido</span>'+
      '<em class="num">'+brl(pot.pontos*faixaDe(pot.pontos).valor)+'</em></div>'
    : '<div class="cx-b"><small>Projeção do mês</small>'+
      '<b class="num">'+inte(l.projecao)+'<i>pts</i></b>'+
      '<span class="cx-t" style="background:'+l.faixaProjetada.cor+'">'+esc(l.faixaProjetada.label)+'</span>'+
      '<em class="num">'+brl(l.valorProjetado)+'</em></div>')+
    '</div>';

  /* ---------- 1) REGRAS ---------- */
  h += '<div class="bl"><h4>Como a pontuação é formada e paga</h4>'+
    '<div class="bl-2col">'+
      '<ul class="bl-ul">'+
        '<li>A cada <b>'+inte(osPorPonto())+' O.S. conferidas</b> = <b>1 ponto</b>.</li>'+
        '<li>A cada <b>'+inte(itensPorPonto())+' itens conferidos</b> = <b>1 ponto</b>.</li>'+
        '<li>Cada <b>carga transportada</b> = <b>'+inte(pontosPorCarga())+' pontos</b>.</li>'+
        '<li>Mês <b>sem nenhum erro</b>: valor do ponto <b>+'+dec(pctB,0)+'%</b>.</li>'+
        '<li>Erro desconta pontos; cada <b>sobra</b> abate '+inte(pontosPorSobra())+'.</li>'+
        '<li><b>3 meses</b> sem meta mínima: medidas conforme a CLT.</li>'+
      '</ul>'+
      '<table class="tab tab-mini"><thead><tr><th>Faixa</th><th class="n">R$/pt</th><th class="n">+'+dec(pctB,0)+'%</th></tr></thead><tbody>';
  getFaixas().forEach(function(f){
    if(f.valor<=0) return;
    var atual=(l.pontos>=f.min && l.pontos<=f.max);
    h += '<tr'+(atual?' class="lin-at"':'')+'><td>'+esc(f.label)+'</td>'+
      '<td class="n">'+dec(f.valor,2)+'</td><td class="n"><b>'+dec(f.valor*(1+pctB/100),2)+'</b></td></tr>';
  });
  h += '</tbody></table></div>'+
    '<p class="mini">Sua conta: '+inte(l.pontosConf)+' pts de conferência'+
    (l.cargas>0?' + '+inte(l.cargas)+' carga'+(l.cargas>1?'s':'')+' ('+inte(l.transportadora)+' pts)':'')+
    (l.pontosDescontados>0?' − '+inte(l.pontosDescontados)+' de penalidade':'')+
    ' = <b>'+inte(l.pontos)+' pts</b> × R$ '+dec(l.faixa.valor,2)+
    (l.bonusSemErro>0?' com +'+dec(pctB,0)+'% (R$ '+dec(l.faixa.valor*(1+pctB/100),2)+')':'')+
    ' = <b>'+brl(l.valorFinal)+'</b>.</p></div>';

  /* ---------- 2) ERROS E SOBRAS ---------- */
  h += '<div class="bl'+(l.qtdErros?' erro':' ok')+'"><h4>Erros e sobras no período</h4>';
  if(!l.qtdErros){
    h += '<p>Nenhum erro registrado. A pontuação vale integralmente: <b>'+inte(l.pontos)+' pts = '+brl(l.valorAtual)+'</b>.'+
      (l.qtdSobras>0?' <span class="mini-i">('+inte(l.qtdSobras)+' sobra'+(l.qtdSobras>1?'s':'')+' — sem erro, não altera a pontuação.)</span>':'')+'</p>'+
      (l.bonusSemErro>0?'<p class="pos-v"><b>Bônus de qualidade:</b> +'+dec(pctB,0)+'% = <b>+'+brl(l.bonusSemErro)+
        '</b>. Total a receber: <b>'+brl(l.valorFinal)+'</b>.</p>':'');
  } else {
    var partes=[]; for(var q=1;q<=l.qtdErros;q++) partes.push(inte(penalidadeDo(q)));
    h += '<p class="num"><b>'+inte(l.qtdErros)+'</b> erro'+(l.qtdErros>1?'s':'')+': '+partes.join(' + ')+
      ' = <b class="neg">− '+inte(l.penalBruta)+' pts</b>'+
      (l.qtdSobras>0?'; <b>'+inte(l.qtdSobras)+'</b> sobra'+(l.qtdSobras>1?'s':'')+' × '+inte(pontosPorSobra())+
        ' = <b class="pos-v">+'+inte(l.abatidoSobra)+'</b> → penalidade <b class="neg">− '+inte(l.pontosDescontados)+'</b>':'')+'.</p>'+
      '<p class="num">'+inte(l.pontosBrutos)+' − '+inte(l.pontosDescontados)+' = <b>'+inte(l.pontos)+
      ' pts válidos</b> × R$ '+dec(l.faixa.valor,2)+' = <b>'+brl(l.valorAtual)+'</b></p>'+
      (l.caiuFaixa?'<p class="mini neg">Os erros derrubaram a faixa de '+esc(l.faixaBruta.label)+' (R$ '+
        dec(l.faixaBruta.valor,2)+') para '+esc(l.faixa.label)+' (R$ '+dec(l.faixa.valor,2)+') — perda de '+brl(l.desconto)+'.</p>'
        :'<p class="mini">Sem os erros seriam '+brl(l.valorBruto)+' — perda de '+brl(l.desconto)+'.</p>')+
      '<p class="mini neg">Próximo erro tira '+inte(l.proximaPenalidade)+' pts. Com erro no mês, o bônus de '+
      dec(pctB,0)+'% não se aplica — seriam '+brl(l.valorBruto*(pctB/100))+' a mais.</p>';
  }
  h += '</div>';

  /* ---------- 3) NÍVEL DE QUALIDADE ---------- */
  if(qc){
    var apr=aprovDe(qc), cq=classeQual(apr), semOcor=qc.osConf-qc.osOcor;
    var qG=qualDaComp(), medEq=0;
    if(qG){ var tO=0,tC=0; itensQualAtivos(qG).forEach(function(i){ tO+=i.osConf; tC+=i.osOcor; });
      medEq = tO>0 ? ((tO-tC)/tO*100) : 0; }
    var difEq=apr-medEq;
    h += '<div class="bl" style="border-color:'+cq.cor+'"><h4>Nível de qualidade — conferência</h4>'+
      '<p class="q-lin"><b class="num" style="color:'+cq.cor+'">'+dec(apr,2)+'%</b>'+
      '<span class="mini-i">de aproveitamento</span>'+
      '<span class="selo" style="background:'+cq.cor+'22;color:'+cq.cor+'">'+esc(cq.label)+'</span></p>'+
      '<div class="tbarra"><i style="width:'+Math.max(0,Math.min(100,apr))+'%;background:'+cq.cor+'"></i></div>'+
      '<p class="num"><b>'+inte(semOcor)+'</b> de '+inte(qc.osConf)+' O.S. sem ocorrência; as outras '+
      inte(qc.osOcor)+' geraram '+inte(qc.qtdOcor)+'.</p>'+
      '<p class="mini">Equipe '+dec(medEq,2)+'% — '+
      (Math.abs(difEq)<0.05?'mesmo nível':(difEq>0?'<b class="pos-v">'+dec(difEq,2)+' p.p. acima</b>':'<b class="neg">'+dec(Math.abs(difEq),2)+' p.p. abaixo</b>'))+
      '. Faixas: 95%+ excelente · 90-95% bom · 80-90% atenção · 70-80% crítico.</p></div>';
  }

  /* ---------- 4) POTENCIAL ---------- */
  if(pot){
    var fPot=faixaDe(pot.pontos), vPot=pot.pontos*fPot.valor;
    var falta=Math.max(0,pot.pontos-l.pontos), pctP=pot.pontos>0?(l.pontos/pot.pontos*100):0;
    var sup=l.pontos>=pot.pontos, pDia=ctx.restantes>0?falta/ctx.restantes:0;
    h += '<div class="bl" style="border-color:#7C3AED;background:#FAF8FF"><h4 style="color:#6D28D9">Seu potencial — melhor mês registrado</h4>'+
      '<p class="num"><b>'+esc(nomeMes(pot.comp))+'</b>: '+inte(pot.pontos)+' pts e '+inte(pot.un)+' unidades'+
      (fPot.valor>0?' ('+brl(vPot)+')':'')+'.</p>'+
      '<div class="tbarra"><i style="width:'+Math.max(0,Math.min(100,pctP))+'%;background:'+(sup?"#16A34A":"#7C3AED")+'"></i></div>'+
      '<p class="mini bar-lbl"><span>hoje '+inte(l.pontos)+'</span><b style="color:'+(sup?"#166534":"#6D28D9")+'">'+
      dec(pctP,1)+'% do potencial</b><span>'+inte(pot.pontos)+'</span></p>'+
      (sup?'<p class="pos-v"><b>Novo recorde.</b> A referência passa a ser '+inte(l.pontos)+' pontos.</p>'
          :'<p>Faltam <b class="num">'+inte(falta)+' pts</b> para igualar o próprio recorde'+
           (ctx.restantes>0?' ('+dec(pDia)+' pts/dia)':'')+'. Já foi alcançado antes.'+
           (vPot>l.valorAtual?' <span class="mini-i">Repetir valeria '+brl(vPot)+' — '+brl(vPot-l.valorAtual)+' a mais.</span>':'')+'</p>')+
      '</div>';
  }

  /* ---------- 5) O QUE FALTA ---------- */
  h += '<div class="bl" style="border-color:'+l.faixaMeta.cor+'"><h4>O que falta para a meta</h4>';
  if(l.baterMeta){
    h += '<p>Meta alcançada. No ritmo de <b class="num">'+dec(l.ritmo)+'</b> pts/dia, a projeção até '+dBR(cfg.fim)+
      ' é de <b class="num">'+inte(l.projecao)+'</b> pts ('+esc(l.faixaProjetada.label)+'), cerca de <b>'+brl(l.valorProjetado)+'</b>.</p>';
  } else {
    h += '<p>Faltam <b class="num">'+inte(l.faltamMeta)+'</b> pts em <b class="num">'+ctx.restantes+
      '</b> dias úteis = <b class="num" style="color:'+l.faixaMeta.cor+'">'+dec(l.porDiaMeta)+' pts/dia</b>.</p>'+
      '<p class="mini">Ritmo atual '+dec(l.ritmo)+' pts/dia · projeção '+inte(l.projecao)+' pts ('+
      esc(l.faixaProjetada.label)+', ~'+brl(l.valorProjetado)+'). Bater a meta vale '+
      brl(Math.max(0,l.valorMeta-l.valorProjetado))+' a mais que a projeção.'+
      (l.prox && l.prox.min!==l.meta?' Passo intermediário: faixa '+esc(l.prox.label)+' começa em '+inte(l.prox.min)+
        ' — faltam '+inte(l.faltamProx)+' ('+dec(l.porDiaProx)+'/dia).':'')+'</p>';
  }
  h += '</div>';

  /* ---------- 6) OBSERVAÇÕES ---------- */
  h += '<div class="bl obs"><h4>Observações do líder</h4>'+
    (l.obs ? '<p class="t-obs">'+esc(l.obs)+'</p>' : '<div class="linhas"><span></span><span></span></div>')+'</div>';

  h += '<div class="assina t-assina"><div>Assinatura do colaborador</div><div>Líder da conferência</div></div></div>';
  return h;
}

function textoTermo(l,ctx,cfg){
  var t=[];
  t.push("TERMO DE FEEDBACK DE PRODUTIVIDADE — EQUIPE DE CONFERÊNCIA");
  t.push("Santa Therezinha"); t.push("");
  t.push("Colaborador: "+l.nome+"  |  Matrícula: "+l.matricula);
  t.push("Período: "+dBR(cfg.inicio)+" a "+dBR(cfg.fim)+"  |  Posição em: "+dBR(cfg.hoje));
  t.push("");
  t.push("Pontos da conferência: "+inte(l.pontosConf));
  if(l.transportadora>0){
    t.push("Pontos de transportadora: +"+inte(l.transportadora));
    t.push("Pontuação bruta (conferência + transportadora): "+inte(l.pontosBrutos));
  } else {
    t.push("Pontuação bruta: "+inte(l.pontosBrutos)+" pontos");
  }
  if(l.qtdErros){
    var pp=[]; for(var q=1;q<=l.qtdErros;q++) pp.push(inte(penalidadeDo(q)));
    t.push("Erros no período: "+inte(l.qtdErros)+" ("+pp.join(" + ")+" = "+inte(l.penalBruta)+" pontos de penalidade)");
    if(l.qtdSobras>0) t.push("Sobras no período: "+inte(l.qtdSobras)+" x "+inte(pontosPorSobra())+" = "+inte(l.abatidoSobra)+
      " pontos abatidos da penalidade. Penalidade final: "+inte(l.pontosDescontados)+" pontos.");
  } else {
    t.push("Erros no período: nenhum.");
    if(l.qtdSobras>0) t.push("Sobras no período: "+inte(l.qtdSobras)+" (sem erro, a sobra não altera a pontuação).");
  }
  t.push("Pontuação válida: "+inte(l.pontos)+" pontos");
  t.push("Faixa atual: "+l.faixa.label+" — R$ "+dec(l.faixa.valor,2)+" por ponto"+
    (l.caiuFaixa ? " (sem os erros seria "+l.faixaBruta.label+", R$ "+dec(l.faixaBruta.valor,2)+")" : ""));
  if(l.bonusSemErro>0) t.push("Bônus de qualidade (sem nenhum erro): +"+dec(l.pctBonus,0)+"% = "+brl(l.bonusSemErro)+
    ". Total a receber: "+brl(l.valorFinal)+".");
  t.push("Prêmio previsto até aqui: "+brl(l.valorAtual)+
    (l.desconto>0 ? " (sem os erros: "+brl(l.valorBruto)+" — perda de "+brl(l.desconto)+")" : ""));
  var qcT=qualDoConf(l);
  if(qcT){
    var aprT=aprovDe(qcT), cqT=classeQual(aprT);
    t.push("");
    t.push("NÍVEL DE QUALIDADE — CONFERÊNCIA");
    t.push("Aproveitamento: "+dec(aprT,2)+"% — "+cqT.label+".");
    t.push(inte(qcT.osConf-qcT.osOcor)+" de "+inte(qcT.osConf)+" O.S. sem nenhuma ocorrência. As outras "+
      inte(qcT.osOcor)+" geraram "+inte(qcT.qtdOcor)+" ocorrência(s).");
    var qG=qualDaComp();
    if(qG){ var a1=0,a2=0; itensQualAtivos(qG).forEach(function(i){ a1+=i.osConf; a2+=i.osOcor; });
      var mEq=a1>0?((a1-a2)/a1*100):0;
      t.push("Média da equipe: "+dec(mEq,2)+"%."); }
  }
  var potT=potencialLinha(l);
  if(potT){
    var fPot=faixaDe(potT.pontos), vPot=potT.pontos*fPot.valor;
    t.push("");
    t.push("SEU POTENCIAL — MELHOR MÊS REGISTRADO");
    t.push("Melhor desempenho: "+nomeMes(potT.comp)+" — "+inte(potT.pontos)+" pontos e "+inte(potT.un)+" unidades"+
      (fPot.valor>0?" ("+fPot.label+", "+brl(vPot)+")":"")+".");
    t.push("Situação de hoje: "+inte(l.pontos)+" pontos = "+dec(potT.pontos>0?l.pontos/potT.pontos*100:0,1)+"% do potencial.");
    if(l.pontos>=potT.pontos){
      t.push("Novo recorde: a pontuação de hoje já superou o melhor mês. Nova referência: "+inte(l.pontos)+" pontos.");
    } else {
      t.push("Faltam "+inte(potT.pontos-l.pontos)+" pontos para igualar o próprio recorde"+
        (ctx.restantes>0?" ("+dec((potT.pontos-l.pontos)/ctx.restantes)+" pontos por dia nos "+ctx.restantes+" dias úteis restantes)":"")+".");
      if(vPot>l.valorAtual) t.push("Repetir o melhor mês representaria "+brl(vPot)+" — "+brl(vPot-l.valorAtual)+" a mais que hoje.");
    }
  }
  t.push("");
  t.push("Meta acordada: "+inte(l.meta)+" pontos ("+l.faixaMeta.label+", R$ "+dec(l.faixaMeta.valor,2)+" por ponto) = "+brl(l.valorMeta));
  if(l.baterMeta) t.push("Situação: meta alcançada.");
  else t.push("Faltam "+inte(l.faltamMeta)+" pontos em "+ctx.restantes+" dias úteis = "+dec(l.porDiaMeta)+" pontos por dia.");
  t.push("Ritmo atual: "+dec(l.ritmo)+" pontos por dia útil ("+ctx.decorridos+" dias corridos).");
  t.push("Projeção do fechamento: "+inte(l.projecao)+" pontos — "+l.faixaProjetada.label+" — "+brl(l.valorProjetado)+".");
  if(l.obs){ t.push(""); t.push("Observações do líder: "+l.obs); }
  t.push(""); t.push("Assinatura do colaborador: ____________________");
  t.push("Líder da conferência: ____________________");
  t.push("");
  t.push("COMO A PONTUAÇÃO É FORMADA E PAGA");
  t.push("- A cada "+inte(osPorPonto())+" O.S. conferidas = 1 ponto.");
  t.push("- A cada "+inte(itensPorPonto())+" itens conferidos = 1 ponto.");
  t.push("- Cada carga transportada = "+inte(pontosPorCarga())+" pontos.");
  t.push("- Sem nenhum erro no mês, o valor do ponto sobe "+dec(pctBonusCfg(),0)+"%.");
  t.push("- Cada sobra abate "+inte(pontosPorSobra())+" pontos da penalidade dos erros.");
  t.push("- 3 meses sem bater a meta mínima acarretam medidas disciplinares conforme a CLT.");
  t.push("Faixas: "+getFaixas().filter(function(f){return f.valor>0;}).map(function(f){
    return f.label+" = R$ "+dec(f.valor,2)+" (R$ "+dec(f.valor*(1+pctBonusCfg()/100),2)+" sem erro)"; }).join(" | "));

  return t.join("\n");
}

/* ====================== ABA QUALIDADE DO CONFERENTE ====================== */
/* Base: relatório 8630 (uma linha por O.S., com TEVE_OCORRENCIA e QTD_OCORRENCIAS).
   Guardado por competência em S.qualidade, para o painel refletir só o mês em apuração. */
function qualDaComp(comp){ return (S.qualidade||{})[comp||compAtual()] || null; }

/* Só entram no relatório os conferentes que estão na aba Conferentes (ativos).
   Quem saiu da equipe continua no arquivo importado, mas não é exibido. */
function conferenteAtivoDe(i){
  var mat=String(i.matricula||"").trim(), ch=chaveNome(i.nome||"");
  for(var k=0;k<S.conferentes.length;k++){
    var c=S.conferentes[k]; if(!c.ativo) continue;
    if(mat && String(c.matricula||"").trim()===mat) return c;
    if(chaveNome(c.nome||"")===ch) return c;
  }
  return null;
}
/* Itens da competência, apenas dos conferentes ativos (usa o nome do cadastro) */
function itensQualAtivos(q){
  if(!q || !q.itens) return [];
  var out=[];
  q.itens.forEach(function(i){
    var c=conferenteAtivoDe(i);
    if(!c) return;
    out.push({matricula:c.matricula, nome:c.nome, osConf:i.osConf, osOcor:i.osOcor, qtdOcor:i.qtdOcor, id:c.id});
  });
  return out;
}
/* Dados de qualidade de um conferente do painel */
function qualDoConf(l){
  var q=qualDaComp(); if(!q) return null;
  var itens=itensQualAtivos(q);
  for(var i=0;i<itens.length;i++){ if(itens[i].id===l.id) return itens[i]; }
  return null;
}

/* Aproveitamento = O.S. conferidas sem nenhuma ocorrência, em % */
function aprovDe(i){ var t=Number(i.osConf)||0, o=Number(i.osOcor)||0;
  return t>0 ? ((t-o)/t*100) : 0; }

/* Classificação por aproveitamento: quanto MAIOR, melhor */
function classeQual(aprov){
  if(aprov>=95) return {label:"Excelente", cor:"#16A34A"};
  if(aprov>=90) return {label:"Bom",       cor:"#1E9C43"};
  if(aprov>=80) return {label:"Atenção",   cor:"#F2B21B"};
  if(aprov>=70) return {label:"Crítico",   cor:"#F2811B"};
  return               {label:"Grave",     cor:"#D62B24"};
}

function abaQualidade(){
  var comp=compAtual(), q=qualDaComp(comp);
  var h='';

  if(!q || !q.itens || !q.itens.length){
    return '<div class="card"><h2 class="disp">Qualidade do conferente</h2>'+
      '<p class="ajuda">Ainda não há dados de qualidade para '+esc(nomeMes(comp))+'.</p>'+
      '<div class="aviso neutro">Importe o relatório de ocorrências (rotina 8630) na aba <b>Configuração</b>. '+
      'O arquivo precisa ter as colunas NUMOS, TEVE_OCORRENCIA e QTD_OCORRENCIAS.</div></div>';
  }

  /* casa com os conferentes cadastrados para ordenar e mostrar pontos */
  var ativos=itensQualAtivos(q);
  var foraEquipe=q.itens.length-ativos.length;
  if(!ativos.length){
    return '<div class="card"><h2 class="disp">Qualidade do conferente</h2>'+
      '<div class="aviso atencao">O arquivo de '+esc(nomeMes(q.competencia))+' foi importado, mas nenhum dos nomes '+
      'confere com os conferentes cadastrados na aba <b>Conferentes</b>. Verifique as matrículas.</div></div>';
  }
  var itens=ativos.slice().sort(function(a,b){ return aprovDe(b)-aprovDe(a) || b.osConf-a.osConf; });
  var totOS=0, totOcorOS=0, totOcor=0;
  itens.forEach(function(i){ totOS+=i.osConf; totOcorOS+=i.osOcor; totOcor+=i.qtdOcor; });
  var aprovGeral = totOS>0 ? ((totOS-totOcorOS)/totOS*100) : 0;
  var cg=classeQual(aprovGeral);

  h += '<div class="card evitar-quebra"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between">'+
    '<div style="min-width:0"><h2 class="disp">Qualidade do conferente</h2>'+
    '<p class="ajuda" style="margin-bottom:0">Aproveitamento = O.S. conferidas <b>sem nenhuma ocorrência</b> sobre o total '+
    'conferido, por conferente. Quanto maior, melhor. Base: '+esc(q.arquivo||"relatório 8630")+' · '+esc(nomeMes(q.competencia))+
    (q.inicio?' · '+dBR(q.inicio)+' a '+dBR(q.fim):'')+'. Apenas os conferentes ativos na aba Conferentes'+
    (foraEquipe>0?' ('+foraEquipe+' fora da equipe não listado'+(foraEquipe>1?'s':'')+')':'')+'.</p></div>'+
    '<div style="display:flex;gap:8px" class="no-print">'+
      '<button class="btn" data-act="imprimirQual" style="padding:6px 12px;font-size:12px">Imprimir</button>'+
      '<button class="btn primario" data-act="csvQual" style="padding:6px 12px;font-size:12px">Exportar relatório</button>'+
    '</div></div>'+
    '<div style="background:linear-gradient(135deg,#EEF6FF,#F6FEF9);border:1px solid #BFE3CC;border-radius:12px;padding:16px;margin-top:10px">'+
      '<div style="font-size:34px;font-weight:800;color:'+cg.cor+';line-height:1" class="num">'+dec(aprovGeral,2)+'%'+
      ' <span style="font-size:16px;font-weight:600;color:#475569">de aproveitamento da equipe</span></div>'+
      '<div style="font-size:14px;color:#334155;margin-top:4px"><b>'+inte(totOS-totOcorOS)+'</b> de '+inte(totOS)+
      ' O.S. saíram sem nenhuma ocorrência. As outras '+inte(totOcorOS)+
      ' somaram <b>'+inte(totOcor)+'</b> ocorrências no período.</div></div></div>';

  h += '<div class="kpis">'+
    '<div class="kpi"><span>O.S. conferidas</span><b class="num">'+inte(totOS)+'</b></div>'+
    '<div class="kpi"><span>O.S. sem ocorrência</span><b class="num">'+inte(totOS-totOcorOS)+'</b></div>'+
    '<div class="kpi'+(totOcorOS?' alerta':'')+'"><span>O.S. com ocorrência</span><b class="num">'+inte(totOcorOS)+'</b></div>'+
    '<div class="kpi destaque"><span>Aproveitamento</span><b class="num">'+dec(aprovGeral,2)+'%</b></div></div>';

  h += '<div class="card"><h2 class="disp">Aproveitamento por conferente</h2>'+
    '<p class="ajuda">Ranking do maior para o menor aproveitamento. O percentual é o que importa: '+
    'quem confere mais O.S. naturalmente acumula mais ocorrências.</p>'+
    '<div class="tabela-wrap"><table class="tabela tab"><thead><tr>'+
    '<th>#</th><th>Conferente</th><th class="n">O.S. conferidas</th><th class="n">Sem ocorrência</th>'+
    '<th class="n">C/ ocorrência</th><th class="n">Aproveitamento</th><th class="n">Ocorrências</th>'+
    '<th class="n">Situação</th></tr></thead><tbody>';
  itens.forEach(function(i,idx){
    var ap=aprovDe(i), cl=classeQual(ap);
    h += '<tr>'+
      '<td class="num" style="color:var(--suave)">'+(idx+1)+'</td>'+
      '<td><b>'+esc(i.nome)+'</b>'+(i.matricula&&i.matricula!=="—"?'<div style="font-size:11px;color:var(--suave)">'+esc(i.matricula)+'</div>':'')+'</td>'+
      '<td class="n">'+inte(i.osConf)+'</td>'+
      '<td class="n pos-v">'+inte(i.osConf-i.osOcor)+'</td>'+
      '<td class="n">'+inte(i.osOcor)+'</td>'+
      '<td class="n"><b style="color:'+cl.cor+'">'+dec(ap,2)+'%</b>'+
        '<div style="height:5px;border-radius:999px;background:#E2E8F0;margin-top:3px;overflow:hidden">'+
        '<i style="display:block;height:100%;width:'+Math.max(0,Math.min(100,ap))+'%;background:'+cl.cor+'"></i></div></td>'+
      '<td class="n">'+inte(i.qtdOcor)+'</td>'+
      '<td class="n"><span class="selo" style="background:'+cl.cor+'22;color:'+cl.cor+'">'+esc(cl.label)+'</span></td></tr>';
  });
  h += '<tr style="background:#F8FAFC"><td></td><td><b>Total da equipe</b></td>'+
    '<td class="n"><b>'+inte(totOS)+'</b></td><td class="n pos-v"><b>'+inte(totOS-totOcorOS)+'</b></td>'+
    '<td class="n"><b>'+inte(totOcorOS)+'</b></td>'+
    '<td class="n"><b>'+dec(aprovGeral,2)+'%</b></td><td class="n"><b>'+inte(totOcor)+'</b></td><td></td></tr>'+
    '</tbody></table></div>'+
    '<p class="ajuda" style="margin-top:10px">Faixas de aproveitamento: 95% ou mais excelente · 90% a 95% bom · '+
    '80% a 90% atenção · 70% a 80% crítico · abaixo de 70% grave.</p></div>';
  return h;
}

function baixarCSVQual(){
  var q=qualDaComp(); if(!q) return;
  var linhasCsv=[["Posicao","Matricula","Conferente","OS conferidas","OS sem ocorrencia","OS com ocorrencia",
    "Aproveitamento","Total ocorrencias","Ocorrencias por OS com problema","Situacao","Competencia"]];
  itensQualAtivos(q).sort(function(a,b){return aprovDe(b)-aprovDe(a) || b.osConf-a.osConf;}).forEach(function(i,idx){
    var ap=aprovDe(i);
    linhasCsv.push([idx+1,i.matricula,i.nome,i.osConf,i.osConf-i.osOcor,i.osOcor,dec(ap,2)+"%",i.qtdOcor,
      dec(i.osOcor>0?i.qtdOcor/i.osOcor:0,1), classeQual(ap).label, q.competencia]);
  });
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var s=String(c); return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url;
  a.download="qualidade-conferentes-"+(q.competencia||"periodo")+".csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ====================== TEMPOS DE CONFERÊNCIA (8635) ====================== */
/* Cada registro: [matricula, numOS, inicioISO, fimISO, qtdItens] */
function processarTempos(dados, nomeArq, achar){
  var kConf=achar("CONFERENTE","NOME","COLABORADOR"), kOS=achar("NUMOS","NUMEROOS");
  var kIni=achar("INICIO","DTINICIO","DATAINICIO"), kFim=achar("FIM","DTFIM","DATAFIM");
  var kQtd=achar("QTD","QUANTIDADE","QTPROD"), kAp=achar("QTAPANHA","APANHA");
  var regs=[], nomes={}, minIni="", maxFim="";
  dados.forEach(function(r){
    var bruto=String(r[kConf]||"").trim();
    if(!bruto || /^\d+$/.test(bruto)) return;                 /* linha de total do relatório */
    var mat="", nome=bruto;
    var m=bruto.match(/^\s*(\d+)\s*[-–]\s*(.+)$/);            /* "MATRÍCULA - NOME" */
    if(m){ mat=m[1]; nome=m[2].trim(); }
    if(/^NAOUSAR$/i.test(nome) || mat==="1") return;
    var ini=paraISOHora(r[kIni]), fim=paraISOHora(r[kFim]);
    if(!ini || !fim) return;
    var chave = mat || chaveNome(nome);
    nomes[chave]=nome.toUpperCase();
    regs.push([chave, String(r[kOS]==null?"":r[kOS]).split(".")[0],
               ini, fim, kQtd?(Number(r[kQtd])||0):0, kAp?(Number(r[kAp])||0):0]);
    if(!minIni || ini<minIni) minIni=ini;
    if(!maxFim || fim>maxFim) maxFim=fim;
  });
  if(!regs.length){
    S.msg={tipo:"erro",texto:"Não encontrei registros de tempo válidos. Colunas lidas: "+Object.keys(dados[0]).join(", ")};
    return render();
  }
  S.previaTempo={ regs:regs, nomes:nomes, arquivo:nomeArq,
    inicio:minIni.slice(0,10), fim:maxFim.slice(0,10),
    competencia:competenciaDe(minIni)||compAtual() };
  S.previa=null; S.previaQual=null; S.msg=null; render();
}
function gravarTempos(){
  var p=S.previaTempo; if(!p) return;
  S.tempos={ regs:p.regs, nomes:p.nomes, arquivo:p.arquivo, inicio:p.inicio, fim:p.fim,
             competencia:p.competencia, importadoEm:hojeISO() };
  S.tFiltroIni=p.inicio; S.tFiltroFim=p.fim;
  S.msg={tipo:"ok",texto:"Tempos importados: "+inte(p.regs.length)+" O.S. de "+
    dBR(p.inicio)+" a "+dBR(p.fim)+"."};
  S.previaTempo=null; salvar(); render();
}

function gapMinimo(){ var v=Number(S.config.gapMin); return isFinite(v)&&v>=0?v:10; }
function duracaoMax(){ var v=Number(S.config.durMaxOS); return isFinite(v)&&v>0?v:720; }
function mediana(arr){
  if(!arr.length) return 0;
  var a=arr.slice().sort(function(x,y){return x-y;}), n=a.length, k=Math.floor(n/2);
  return n%2 ? a[k] : (a[k-1]+a[k])/2;
}

/* Calcula tempos por conferente dentro do período filtrado.
   Ocioso = intervalo entre o fim da última O.S. já aberta e o início da próxima, no MESMO DIA. */
function calcTempos(ini, fim){
  var T=S.tempos; if(!T || !T.regs) return null;
  var gmin=gapMinimo(), dmax=duracaoMax();
  var porConf={};
  T.regs.forEach(function(r){
    var dia=r[2].slice(0,10);
    if(ini && dia<ini) return;
    if(fim && dia>fim) return;
    var c = porConf[r[0]] || (porConf[r[0]]={chave:r[0], nome:T.nomes[r[0]]||r[0], dias:{}, itens:0});
    var d = c.dias[dia] || (c.dias[dia]=[]);
    d.push(r); c.itens += Number(r[4])||0;
  });
  var out=[], totOS=0, totOcioso=0, totJornada=0, totAbertas=0, todasDur=[];
  Object.keys(porConf).forEach(function(k){
    var c=porConf[k], durs=[], ocioso=0, gaps=[], jornada=0, nOS=0, abertas=0, maiorGap=0;
    Object.keys(c.dias).forEach(function(dia){
      var lista=c.dias[dia].slice().sort(function(a,b){ return a[2]<b[2]?-1:(a[2]>b[2]?1:0); });
      var maxFim=null, ini0=lista[0][2], fim0=lista[0][3];
      lista.forEach(function(r){
        nOS++;
        var dur=minutosEntre(r[2],r[3]);
        if(dur>=0 && dur<=dmax) durs.push(dur); else if(dur>dmax) abertas++;
        if(maxFim!==null){
          var g=minutosEntre(maxFim, r[2]);
          if(g>=gmin){ ocioso+=g; gaps.push(g); if(g>maiorGap) maiorGap=g; }
        }
        if(maxFim===null || r[3]>maxFim) maxFim=r[3];
        if(r[3]>fim0) fim0=r[3];
      });
      jornada += Math.max(0, minutosEntre(ini0, fim0));
    });
    var nDias=Object.keys(c.dias).length;
    todasDur=todasDur.concat(durs);
    totOS+=nOS; totOcioso+=ocioso; totJornada+=jornada; totAbertas+=abertas;
    out.push({chave:c.chave, nome:c.nome, os:nOS, itens:c.itens, dias:nDias,
      durMed:mediana(durs), durMedia: durs.length?durs.reduce(function(a,b){return a+b;},0)/durs.length:0,
      tempoConf: durs.reduce(function(a,b){return a+b;},0),
      ocioso:ocioso, nGaps:gaps.length, gapMed:mediana(gaps), maiorGap:maiorGap,
      jornada:jornada, pctOcioso: jornada>0 ? ocioso/jornada*100 : 0,
      ociosoDia: nDias? ocioso/nDias : 0, osDia: nDias? nOS/nDias : 0, abertas:abertas});
  });
  return {itens:out, totOS:totOS, totOcioso:totOcioso, totJornada:totJornada,
    durMedGeral:mediana(todasDur), totAbertas:totAbertas,
    pctOcioso: totJornada>0 ? totOcioso/totJornada*100 : 0};
}

/* Registros de um conferente no período, com duração e intervalo desde a O.S. anterior */
function detalheTempos(chave, ini, fim){
  var T=S.tempos; if(!T) return null;
  var gmin=gapMinimo(), dmax=duracaoMax();
  var porDia={};
  T.regs.forEach(function(r){
    if(r[0]!==chave) return;
    var dia=r[2].slice(0,10);
    if(ini && dia<ini) return;
    if(fim && dia>fim) return;
    (porDia[dia]||(porDia[dia]=[])).push(r);
  });
  var dias=Object.keys(porDia).sort(), out=[];
  dias.forEach(function(dia){
    var lista=porDia[dia].slice().sort(function(a,b){ return a[2]<b[2]?-1:(a[2]>b[2]?1:0); });
    var maxFim=null;
    lista.forEach(function(r,i){
      var dur=minutosEntre(r[2],r[3]);
      var gap=null;
      if(maxFim!==null){ var g=minutosEntre(maxFim,r[2]); gap = g>0 ? g : 0; }
      out.push({dia:dia, os:r[1], ini:r[2], fim:r[3], dur:dur, gap:gap,
                ocioso: (gap!==null && gap>=gmin), aberta: dur>dmax,
                itens:r[4], apanha:r[5], primeira:(i===0)});
      if(maxFim===null || r[3]>maxFim) maxFim=r[3];
    });
  });
  return {dias:dias, regs:out, nome:(T.nomes[chave]||chave), chave:chave};
}

/* O.S. finalizadas por hora do dia (usa o horário de FIM) */
function osPorHora(ini, fim){
  var T=S.tempos; if(!T) return null;
  var h=[], i;
  for(i=0;i<24;i++) h.push(0);
  var total=0;
  T.regs.forEach(function(r){
    var dia=r[3].slice(0,10);
    if(ini && dia<ini) return;
    if(fim && dia>fim) return;
    var hh=parseInt(r[3].slice(11,13),10);
    if(isFinite(hh)){ h[hh]++; total++; }
  });
  return {horas:h, total:total};
}

function graficoHoras(d){
  if(!d || !d.total) return '<div class="aviso neutro">Sem O.S. no período.</div>';
  var ini=0, fim=23;
  while(ini<23 && d.horas[ini]===0) ini++;
  while(fim>ini && d.horas[fim]===0) fim--;
  var n=fim-ini+1, vmax=Math.max.apply(null,d.horas)||1;
  var L=44, R=16, T=22, B=34, W=Math.max(640, n*34+L+R), H=250;
  var iw=W-L-R, ih=H-T-B, larg=iw/n, bw=Math.min(26, larg*0.7);
  var pico=d.horas.indexOf(vmax);
  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">';
  for(var k=0;k<=4;k++){
    var y=T+ih-(k/4)*ih, v=vmax*k/4;
    svg += '<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="#E8EDF3" stroke-width="1"/>'+
      '<text x="'+(L-7)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#8A97A8">'+inte(v)+'</text>';
  }
  for(var i=ini;i<=fim;i++){
    var idx=i-ini, x=L+larg*(idx+0.5), v=d.horas[i];
    var alt=(v/vmax)*ih, y=T+ih-alt;
    var cor = i===pico ? "#0B4DA2" : "#4E86D6";
    svg += '<rect x="'+(x-bw/2)+'" y="'+y+'" width="'+bw+'" height="'+Math.max(1,alt)+'" rx="3" fill="'+cor+'">'+
      '<title>'+String(i).padStart(2,"0")+'h: '+inte(v)+' O.S.</title></rect>';
    if(v>0) svg += '<text x="'+x+'" y="'+(y-4)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="'+cor+'">'+inte(v)+'</text>';
    svg += '<text x="'+x+'" y="'+(H-12)+'" text-anchor="middle" font-size="11" fill="#5A6675">'+String(i).padStart(2,"0")+'h</text>';
  }
  svg += '</svg>';
  return svg;
}
function abaTempos(){
  var T=S.tempos;
  if(!T || !T.regs || !T.regs.length){
    return '<div class="card"><h2 class="disp">Tempo de conferência</h2>'+
      '<p class="ajuda">Mostra quanto tempo cada conferente leva para finalizar uma O.S. e quanto tempo fica '+
      'parado entre uma O.S. e outra.</p>'+
      '<div class="aviso neutro">Nenhum arquivo de tempos importado. Envie o relatório <b>8635</b> na aba '+
      '<b>Configuração</b> — ele precisa ter as colunas CONFERENTE, NUMOS, INICIO e FIM.</div></div>';
  }
  var fIni=S.tFiltroIni||T.inicio, fFim=S.tFiltroFim||T.fim;
  var d=calcTempos(fIni,fFim);
  var ordem=S.tOrdem||"pctOcioso";
  var itens=(d?d.itens:[]).filter(function(x){
    return S.tSoAtivos===false ? true : !!conferenteAtivoDe({matricula:x.chave, nome:x.nome});
  });
  itens.sort(function(a,b){ return (b[ordem]||0)-(a[ordem]||0); });

  var h='<div class="card evitar-quebra"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between">'+
    '<div style="min-width:0"><h2 class="disp">Tempo de conferência e ociosidade</h2>'+
    '<p class="ajuda" style="margin-bottom:0">Base: '+esc(T.arquivo||"relatório 8635")+' · '+
    inte(T.regs.length)+' O.S. de '+dBR(T.inicio)+' a '+dBR(T.fim)+'. '+
    'O tempo ocioso é o intervalo entre o fim de uma O.S. e o início da seguinte, contado apenas dentro do mesmo dia.</p></div>'+
    '<div style="display:flex;gap:8px" class="no-print">'+
      '<button class="btn" data-act="imprimirTempo" style="padding:6px 12px;font-size:12px">Imprimir</button>'+
      '<button class="btn primario" data-act="csvTempo" style="padding:6px 12px;font-size:12px">Exportar</button>'+
    '</div></div>'+
    '<p class="ajuda" style="margin-top:8px">Período analisado: <b>'+dBR(fIni)+' a '+dBR(fFim)+'</b> · '+
    inte(itens.length)+' conferentes.</p></div>';

  if(!itens.length) return h+'<div class="card"><div class="aviso neutro">Nenhum registro no período escolhido.</div></div>';

  var tOS=0,tOc=0,tJor=0,tAb=0,todas=[];
  itens.forEach(function(x){ tOS+=x.os; tOc+=x.ocioso; tJor+=x.jornada; tAb+=x.abertas; });
  var pctG = tJor>0 ? tOc/tJor*100 : 0;
  var durG = mediana(itens.map(function(x){return x.durMed;}));

  h += '<div class="kpis">'+
    '<div class="kpi"><span>O.S. no período</span><b class="num">'+inte(tOS)+'</b></div>'+
    '<div class="kpi"><span>Tempo por O.S. (mediana)</span><b class="num">'+hhmm(durG)+'</b></div>'+
    '<div class="kpi'+(pctG>15?' alerta':'')+'"><span>Tempo ocioso total</span><b class="num">'+hhmm(tOc)+'</b></div>'+
    '<div class="kpi'+(pctG>15?' alerta':'')+'"><span>% ocioso da jornada</span><b class="num">'+dec(pctG,1)+'%</b></div></div>';

  /* ---- gráfico hora a hora ---- */
  var ph=osPorHora(fIni,fFim);
  if(ph && ph.total){
    var pico=ph.horas.indexOf(Math.max.apply(null,ph.horas));
    h += '<div class="card evitar-quebra"><h2 class="disp">O.S. finalizadas por hora</h2>'+
      '<p class="ajuda">Distribuição das '+inte(ph.total)+' O.S. do período pelo horário de encerramento. '+
      'Pico às <b>'+String(pico).padStart(2,"0")+'h</b> com '+inte(ph.horas[pico])+' O.S.</p>'+
      '<div class="rolar">'+graficoHoras(ph)+'</div></div>';
  }

  h += '<div class="card"><h2 class="disp">Por conferente</h2>'+
    '<p class="ajuda">"Por O.S." usa a mediana, que não se distorce com O.S. esquecidas em aberto. '+
    'Intervalos abaixo de '+inte(gapMinimo())+' min não contam como ociosidade (troca normal de tarefa).</p>'+
    '<div class="tabela-wrap"><table class="tabela tab"><thead><tr>'+
    '<th>Conferente</th><th class="n">Dias</th><th class="n">O.S.</th><th class="n">O.S./dia</th>'+
    '<th class="n">Por O.S. (mediana)</th><th class="n">Conferindo</th>'+
    '<th class="n">Ocioso</th><th class="n">Ocioso/dia</th><th class="n">% ocioso</th>'+
    '<th class="n">Maior intervalo</th></tr></thead><tbody>';
  itens.forEach(function(x){
    var cor = x.pctOcioso>=25 ? "#D62B24" : (x.pctOcioso>=15 ? "#F2811B" : (x.pctOcioso>=8 ? "#F2B21B" : "#16A34A"));
    h += '<tr>'+
      '<td><button class="lnk" data-act="tDet" data-id="'+esc(x.chave)+'">'+esc(x.nome)+'</button>'+
        (x.abertas?'<div style="font-size:10px;color:var(--suave)">'+x.abertas+
        ' O.S. acima de '+hhmm(duracaoMax())+' (provável esquecida em aberto)</div>':'')+'</td>'+
      '<td class="n">'+inte(x.dias)+'</td><td class="n">'+inte(x.os)+'</td>'+
      '<td class="n">'+dec(x.osDia,1)+'</td>'+
      '<td class="n"><b>'+hhmm(x.durMed)+'</b></td>'+
      '<td class="n">'+hhmm(x.tempoConf)+'</td>'+
      '<td class="n'+(x.ocioso>0?' neg':'')+'">'+hhmm(x.ocioso)+
        (x.nGaps?'<div style="font-size:10px;color:var(--suave)">'+x.nGaps+' paradas</div>':'')+'</td>'+
      '<td class="n">'+hhmm(x.ociosoDia)+'</td>'+
      '<td class="n"><b style="color:'+cor+'">'+dec(x.pctOcioso,1)+'%</b>'+
        '<div style="height:5px;border-radius:999px;background:#E2E8F0;margin-top:3px;overflow:hidden">'+
        '<i style="display:block;height:100%;width:'+Math.min(100,x.pctOcioso*2)+'%;background:'+cor+'"></i></div></td>'+
      '<td class="n">'+hhmm(x.maiorGap)+'</td></tr>';
  });
  h += '<tr style="background:#F8FAFC"><td><b>Total / mediana</b></td><td></td>'+
    '<td class="n"><b>'+inte(tOS)+'</b></td><td></td>'+
    '<td class="n"><b>'+hhmm(durG)+'</b></td><td class="n"><b>'+hhmm(tJor-tOc)+'</b></td>'+
    '<td class="n neg"><b>'+hhmm(tOc)+'</b></td><td></td>'+
    '<td class="n"><b>'+dec(pctG,1)+'%</b></td><td></td></tr></tbody></table></div>'+
    (tAb?'<p class="ajuda" style="margin-top:10px">'+inte(tAb)+' O.S. passaram de '+hhmm(duracaoMax())+
      ' e ficaram fora da mediana de tempo — normalmente são O.S. que não foram encerradas no sistema.</p>':'')+
    '<p class="ajuda" style="margin-top:6px">Referência de cor no % ocioso: até 8% bom · 8 a 15% atenção · '+
    '15 a 25% alto · acima de 25% crítico. Clique no nome para ver O.S. por O.S.</p></div>';

  if(S.tDet) h += blocoDetalheTempo(S.tDet, fIni, fFim);
  return h;
}

/* Relatório detalhado de um conferente, O.S. por O.S. */
function blocoDetalheTempo(chave, fIni, fFim){
  var d=detalheTempos(chave, fIni, fFim);
  if(!d || !d.regs.length) return '<div class="card"><div class="aviso neutro">Sem O.S. desse conferente no período.</div></div>';
  var tot=0, totOc=0, durs=[];
  d.regs.forEach(function(r){ if(!r.aberta){ tot+=r.dur; durs.push(r.dur); } if(r.ocioso) totOc+=r.gap; });

  var h='<div class="card" id="detTempo"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between">'+
    '<div style="min-width:0"><h2 class="disp">Relatório de tempo — '+esc(d.nome)+'</h2>'+
    '<p class="ajuda" style="margin-bottom:0">'+inte(d.regs.length)+' O.S. em '+d.dias.length+' dia'+(d.dias.length>1?'s':'')+
    ' · '+dBR(fIni)+' a '+dBR(fFim)+' · mediana '+hhmm(mediana(durs))+' por O.S. · ocioso '+hhmm(totOc)+'</p></div>'+
    '<div style="display:flex;gap:8px" class="no-print">'+
      '<button class="btn" data-act="csvDetTempo" style="padding:6px 12px;font-size:12px">Exportar</button>'+
      '<button class="btn primario" data-act="imprimirDet" style="padding:6px 12px;font-size:12px">Imprimir este relatório</button>'+
      '<button class="btn" data-act="tFechaDet" style="padding:6px 12px;font-size:12px">Fechar</button>'+
    '</div></div>'+
    '<div class="tabela-wrap" style="margin-top:10px"><table class="tabela tab"><thead><tr>'+
    '<th>Dia</th><th>O.S.</th><th class="n">Início</th><th class="n">Fim</th>'+
    '<th class="n">Duração</th><th class="n">Ocioso antes</th><th class="n">Itens</th></tr></thead><tbody>';
  var diaAnt="";
  d.regs.forEach(function(r){
    var novoDia = r.dia!==diaAnt; diaAnt=r.dia;
    h += '<tr'+(r.aberta?' style="background:#FFFBEB"':(r.ocioso?' style="background:#FEF7F7"':''))+'>'+
      '<td>'+(novoDia?'<b>'+dBR(r.dia)+'</b>':'<span style="color:#CBD5E1">·</span>')+'</td>'+
      '<td class="num">'+esc(r.os)+'</td>'+
      '<td class="n num">'+esc(r.ini.slice(11,16))+'</td>'+
      '<td class="n num">'+esc(r.fim.slice(11,16))+'</td>'+
      '<td class="n"><b>'+hhmm(r.dur)+'</b>'+(r.aberta?'<div style="font-size:10px;color:#B45309">em aberto?</div>':'')+'</td>'+
      '<td class="n'+(r.ocioso?' neg':'')+'">'+(r.gap===null?'<span style="color:var(--suave)">início do dia</span>'
        :(r.ocioso?hhmm(r.gap):'<span style="color:var(--suave)">'+hhmm(r.gap)+'</span>'))+'</td>'+
      '<td class="n">'+inte(r.itens)+'</td></tr>';
  });
  h += '</tbody></table></div>'+
    '<p class="ajuda" style="margin-top:10px">Linhas em vermelho: houve intervalo de '+inte(gapMinimo())+
    ' min ou mais antes de iniciar a O.S. Linhas em amarelo: O.S. acima de '+hhmm(duracaoMax())+
    ', provavelmente não encerrada no sistema.</p>'+
    '<div class="assina" style="margin-top:26px"><div>Assinatura do conferente</div><div>Líder da conferência</div></div></div>';
  return h;
}

function baixarCSVDetTempo(){
  var T=S.tempos; if(!T || !S.tDet) return;
  var fIni=S.tFiltroIni||T.inicio, fFim=S.tFiltroFim||T.fim;
  var d=detalheTempos(S.tDet, fIni, fFim); if(!d) return;
  var linhasCsv=[["Conferente","Dia","OS","Inicio","Fim","Duracao (min)","Ocioso antes (min)","Itens","Observacao"]];
  d.regs.forEach(function(r){
    linhasCsv.push([d.nome, dBR(r.dia), r.os, r.ini.slice(11,16), r.fim.slice(11,16),
      dec(r.dur,1), r.gap===null?"":dec(r.gap,1), r.itens,
      r.aberta?"O.S. acima do limite (possivel nao encerrada)":(r.ocioso?"Intervalo ocioso":"")]);
  });
  var csv=linhasCsv.map(function(x){ return x.map(function(c){
    var t=String(c); return /[;"\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url;
  a.download="tempos-"+d.nome.split(" ")[0].toLowerCase()+".csv"; a.click();
  URL.revokeObjectURL(url);
}
function opt2(v,rot,atual){ return '<option value="'+v+'"'+(atual===v?" selected":"")+'>'+esc(rot)+'</option>'; }

function baixarCSVTempo(){
  var fIni=S.tFiltroIni||(S.tempos||{}).inicio, fFim=S.tFiltroFim||(S.tempos||{}).fim;
  var d=calcTempos(fIni,fFim); if(!d) return;
  var linhasCsv=[["Conferente","Periodo","Dias","OS","OS por dia","Minutos por OS (mediana)",
    "Minutos por OS (media)","Minutos conferindo","Minutos ociosos","Paradas","Ocioso por dia (min)",
    "Percentual ocioso","Maior intervalo (min)","Itens","OS em aberto"]];
  d.itens.slice().sort(function(a,b){return b.pctOcioso-a.pctOcioso;}).forEach(function(x){
    linhasCsv.push([x.nome, dBR(fIni)+" a "+dBR(fFim), x.dias, x.os, dec(x.osDia,1),
      dec(x.durMed,1), dec(x.durMedia,1), Math.round(x.tempoConf), Math.round(x.ocioso), x.nGaps,
      Math.round(x.ociosoDia), dec(x.pctOcioso,1)+"%", Math.round(x.maiorGap), x.itens, x.abertas]);
  });
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var t=String(c); return /[;"\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url; a.download="tempos-conferencia.csv"; a.click();
  URL.revokeObjectURL(url);
}
/* ====================== ABA HISTÓRICO DE PONTUAÇÃO ====================== */
/* ---------- Gráfico de linha em SVG (sem bibliotecas, funciona offline) ---------- */
function mesCurto(comp){
  var m=String(comp||"").match(/^(\d{4})-(\d{2})/); if(!m) return "—";
  var abrev=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return abrev[(+m[2])-1]+"/"+m[1].slice(2);
}
function anoDe(comp){ var m=String(comp||"").match(/^(\d{4})/); return m?m[1]:""; }

/* ---------- Potencial: o melhor mês já registrado do conferente ---------- */
function chaveConf(c){ return String(c.matricula||"").trim() || chaveNome(c.nome||""); }

/* Percorre o histórico (meses fechados) e devolve o mês de maior pontuação */
function potencialDe(chave){
  var melhor=null;
  Object.keys(S.historico||{}).forEach(function(k){
    (S.historico[k].itens||[]).forEach(function(i){
      var ch=String(i.matricula||"").trim();
      if(ch!==chave && chaveNome(i.nome||"")!==chave) return;
      var p=Number(i.pontos)||0;
      if(!melhor || p>melhor.pontos)
        melhor={comp:k, pontos:p, un:Number(i.un)||0, os:Number(i.os)||0};
    });
  });
  return melhor;
}
/* Potencial de uma linha do painel (conferente atual) */
function potencialLinha(l){ return potencialDe(chaveConf(l)); }

/* Potencial da equipe: soma do melhor mês de cada conferente */
function potencialEquipe(){
  var tp=0, tu=0, achou=false, ultComp="";
  conferentesHistorico().forEach(function(c){
    var p=potencialDe(c.chave);
    if(p){ tp+=p.pontos; tu+=p.un; achou=true; if(p.comp>ultComp) ultComp=p.comp; }
  });
  return achou ? {comp:ultComp, pontos:tp, un:tu, os:0, equipe:true} : null;
}

function graficoLinha(serie, opcoes){
  var o=opcoes||{}, cor=o.cor||"#1C63C7", corAnt=o.corAnt||"#F2811B", titulo=o.titulo||"", fmt=o.fmt||inte;
  var pts=serie.filter(function(p){ return p.valor!=null; });
  if(!pts.length) return '<div class="aviso neutro">Sem dados para exibir.</div>';

  var anoAtual = anoDe(compAtual());
  var corDe=function(p){ return anoDe(p.comp)===anoAtual ? cor : corAnt; };
  /* anos presentes, para a legenda */
  var anos=[], vistos={};
  serie.forEach(function(p){ var a=anoDe(p.comp); if(a && !vistos[a]){ vistos[a]=true; anos.push(a); } });

  var n=serie.length;
  var L=64, R=44, T=34, B=42, W=680, H=280;
  var iw=W-L-R, ih=H-T-B;
  var vals=pts.map(function(p){return p.valor;});
  if(o.ref!=null) vals=vals.concat([o.ref]);      /* a linha de potencial entra na escala */
  var vmax=Math.max.apply(null,vals), vmin=Math.min.apply(null,vals);
  if(vmax===vmin){ vmax=vmax||1; vmin=0; }
  var folga=(vmax-vmin)*0.22; vmax+=folga; vmin=Math.max(0,vmin-folga);
  var px=function(i){ return n<=1 ? L+iw/2 : L + (i/(n-1))*iw; };
  var py=function(v){ return T + ih - ((v-vmin)/(vmax-vmin))*ih; };

  /* grade horizontal com 4 marcas */
  var g="";
  for(var k=0;k<=3;k++){
    var v=vmin+(vmax-vmin)*(k/3), y=py(v);
    g += '<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="#E8EDF3" stroke-width="1"/>'+
         '<text x="'+(L-10)+'" y="'+(y+5)+'" text-anchor="end" font-size="13" fill="#8A97A8">'+esc(fmt(v))+'</text>';
  }
  /* separador quando muda o ano */
  var sep="";
  for(var i=1;i<n;i++){
    if(anoDe(serie[i].comp)!==anoDe(serie[i-1].comp)){
      var xs=(px(i)+px(i-1))/2;
      sep += '<line x1="'+xs+'" y1="'+T+'" x2="'+xs+'" y2="'+(T+ih)+'" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="4 4"/>'+
             '<text x="'+xs+'" y="'+(T-12)+'" text-anchor="middle" font-size="11" fill="#94A3B8">'+esc(anoDe(serie[i].comp))+'</text>';
    }
  }
  /* linha de potencial (melhor mês) */
  var refSvg="";
  if(o.ref!=null){
    var yr=py(o.ref), corR=o.corRef||"#7C3AED";
    refSvg = '<line x1="'+L+'" y1="'+yr+'" x2="'+(W-R)+'" y2="'+yr+'" stroke="'+corR+
      '" stroke-width="2.5" stroke-dasharray="8 5" opacity="0.9"/>'+
      '<rect x="'+(L+4)+'" y="'+(yr-19)+'" width="'+Math.max(96,String(o.refRotulo||"").length*6.4)+'" height="17" rx="4" fill="'+corR+'" opacity="0.12"/>'+
      '<text x="'+(L+10)+'" y="'+(yr-6)+'" font-size="12" font-weight="700" fill="'+corR+'">'+esc(o.refRotulo||"")+'</text>';
  }
  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">'+g+sep+refSvg;

  /* linha: cada trecho na cor do ano do ponto de destino */
  var ant=null;
  serie.forEach(function(p,i){
    if(p.valor==null) return;
    var x=px(i), y=py(p.valor);
    if(ant){
      var mudouAno = anoDe(p.comp)!==anoDe(ant.p.comp);
      svg += '<line x1="'+ant.x+'" y1="'+ant.y+'" x2="'+x+'" y2="'+y+'" stroke="'+corDe(p)+
             '" stroke-width="3" stroke-linecap="round"'+(mudouAno?' stroke-dasharray="6 4"':'')+'/>';
    }
    ant={x:x,y:y,p:p};
  });
  /* pontos e valores */
  var mostrarTodos = n<=8;
  serie.forEach(function(p,i){
    var x=px(i), c=corDe(p);
    if(p.valor!=null){
      var y=py(p.valor);
      svg += '<circle cx="'+x+'" cy="'+y+'" r="5.5" fill="#fff" stroke="'+c+'" stroke-width="3"/>';
      var ehExtremo = (p.valor===Math.max.apply(null,vals) || p.valor===Math.min.apply(null,vals) || i===n-1);
      if(mostrarTodos || ehExtremo){
        var anc = (i===0 && n>1) ? "start" : ((i===n-1 && n>1) ? "end" : "middle");
        svg += '<text x="'+x+'" y="'+(y-14)+'" text-anchor="'+anc+'" font-size="14" font-weight="700" fill="'+c+'">'+esc(fmt(p.valor))+'</text>';
      }
    }
    if(mostrarTodos || i===0 || i===n-1 || i%2===0){
      var ancR = (i===0 && n>1) ? "start" : ((i===n-1 && n>1) ? "end" : "middle");
      svg += '<text x="'+x+'" y="'+(H-14)+'" text-anchor="'+ancR+'" font-size="12.5" fill="#5A6675">'+esc(p.rotulo)+'</text>';
    }
  });
  svg += '</svg>';

  /* legenda por ano */
  var itensLeg=[];
  if(anos.length>1){
    anos.forEach(function(a){
      var c = a===anoAtual ? cor : corAnt;
      itensLeg.push('<span style="display:inline-flex;align-items:center;gap:6px">'+
        '<span style="width:16px;height:4px;border-radius:2px;background:'+c+';display:inline-block"></span>'+esc(a)+'</span>');
    });
  }
  if(o.ref!=null){
    itensLeg.push('<span style="display:inline-flex;align-items:center;gap:6px">'+
      '<span style="width:16px;height:0;border-top:3px dashed '+(o.corRef||"#7C3AED")+';display:inline-block"></span>'+
      esc(o.legRef||"potencial")+'</span>');
  }
  var leg = itensLeg.length ? '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#475569;margin:2px 0 4px">'+
    itensLeg.join("")+'</div>' : "";
  return (titulo?'<div style="font-size:14px;font-weight:700;color:#334155;margin-bottom:4px">'+esc(titulo)+'</div>':'')+leg+svg;
}

/* Série de um conferente (ou da equipe) ao longo dos meses do histórico + mês atual */
function serieHistorico(chave, incluirAtual){
  var comps=Object.keys(S.historico||{}).sort();
  var linhasAtuais = incluirAtual ? linhas() : [];
  if(incluirAtual && comps.indexOf(compAtual())<0) comps.push(compAtual());
  return comps.map(function(k){
    var atual = (k===compAtual() && incluirAtual);
    var itens = atual
      ? linhasAtuais.map(function(l){ return {matricula:l.matricula, nome:l.nome, pontos:l.pontos, os:l.os, un:l.un}; })
      : ((S.historico[k]||{}).itens||[]);
    if(chave==="__equipe"){
      var tp=0,tu=0,to=0,n=0;
      itens.forEach(function(i){ tp+=Number(i.pontos)||0; tu+=Number(i.un)||0; to+=Number(i.os)||0; n++; });
      return {comp:k, rotulo:mesCurto(k)+(atual?"*":""), pontos:tp, un:tu, os:to, n:n, atual:atual};
    }
    var achou=null;
    itens.forEach(function(i){
      if(achou) return;
      if(String(i.matricula||"").trim()===chave || chaveNome(i.nome)===chave) achou=i;
    });
    return {comp:k, rotulo:mesCurto(k)+(atual?"*":""),
      pontos: achou?(Number(achou.pontos)||0):null,
      un: achou?(Number(achou.un)||0):null,
      os: achou?(Number(achou.os)||0):null, atual:atual};
  });
}

/* Lista de conferentes que aparecem no histórico (ou hoje) */
function conferentesHistorico(){
  var mapa={};
  Object.keys(S.historico||{}).forEach(function(k){
    (S.historico[k].itens||[]).forEach(function(i){
      var ch=String(i.matricula||"").trim() || chaveNome(i.nome);
      if(!mapa[ch]) mapa[ch]={chave:ch, nome:i.nome, matricula:i.matricula};
    });
  });
  S.conferentes.forEach(function(c){
    if(!c.ativo) return;
    var ch=String(c.matricula||"").trim() || chaveNome(c.nome);
    if(!mapa[ch]) mapa[ch]={chave:ch, nome:c.nome, matricula:c.matricula};
  });
  return Object.keys(mapa).map(function(k){return mapa[k];})
    .sort(function(a,b){ return a.nome.localeCompare(b.nome); });
}
function abaHistorico(){
  var comps=Object.keys(S.historico||{}).sort().reverse();
  var h='<div class="card"><h2 class="disp">Histórico de pontuação</h2>'+
    '<p class="ajuda">Meses já encerrados, guardados a partir do mesmo relatório de pontuação (8173) importado na '+
    'aba Configuração. O histórico <b>não altera o painel</b>: o painel e a apuração mostram apenas '+
    esc(nomeMes(compAtual()))+'.</p>';
  if(!comps.length){
    h += '<div class="aviso neutro">Nenhum mês no histórico ainda. Ao importar um arquivo de pontuação de outro mês, '+
      'o painel oferece a opção <b>"Guardar apenas no histórico"</b>.</div></div>';
    return h;
  }
  h += '</div>';

  /* evolução da equipe mês a mês */
  var serie=comps.slice().reverse().map(function(k){
    var m=S.historico[k], tot=0, n=0;
    m.itens.forEach(function(i){ tot+=i.pontos; n++; });
    return {comp:k, total:tot, n:n, media:n?tot/n:0};
  });
  var maxTot=Math.max.apply(null, serie.map(function(s){return s.total;}))||1;
  h += '<div class="card evitar-quebra"><h2 class="disp">Evolução da equipe</h2>'+
    '<div class="tabela-wrap"><table class="tabela tab"><thead><tr><th>Mês</th><th class="n">Conferentes</th>'+
    '<th class="n">Pontos totais</th><th class="n">Média por conferente</th><th style="width:38%">Comparativo</th></tr></thead><tbody>';
  serie.forEach(function(s){
    h += '<tr><td><b>'+esc(nomeMes(s.comp))+'</b></td><td class="n">'+inte(s.n)+'</td>'+
      '<td class="n"><b>'+inte(s.total)+'</b></td><td class="n">'+dec(s.media)+'</td>'+
      '<td><div style="height:9px;border-radius:999px;background:#E2E8F0;overflow:hidden">'+
      '<i style="display:block;height:100%;width:'+(s.total/maxTot*100)+'%;background:var(--azul)"></i></div></td></tr>';
  });
  h += '</tbody></table></div></div>';

  /* ---------- evolução por conferente (gráficos) ---------- */
  var listaConf=conferentesHistorico();
  var selC = S.histConf || "__equipe";
  if(selC!=="__equipe" && !listaConf.some(function(x){return x.chave===selC;})) selC="__equipe";
  var incluirAtual = S.histAtual!==false;
  var serieC = serieHistorico(selC, incluirAtual);
  var nomeSel = selC==="__equipe" ? "Toda a equipe"
    : (listaConf.filter(function(x){return x.chave===selC;})[0]||{}).nome||"";

  var optsC='<option value="__equipe"'+(selC==="__equipe"?" selected":"")+'>Toda a equipe (soma)</option>'+
    listaConf.map(function(x){ return '<option value="'+esc(x.chave)+'"'+(x.chave===selC?" selected":"")+'>'+
      esc(x.nome)+(x.matricula&&x.matricula!=="—"?" · "+esc(x.matricula):"")+'</option>'; }).join("");

  h += '<div class="card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;justify-content:space-between">'+
    '<div style="min-width:0"><h2 class="disp">Evolução por conferente</h2>'+
    '<p class="ajuda" style="margin-bottom:0">Pontuação e unidades conferidas mês a mês.'+
    (incluirAtual?' O mês marcado com * ainda está em apuração.':'')+'</p></div>'+
    '<label class="campo no-print" style="max-width:300px;margin:0"><span>Conferente</span>'+
      '<select data-act="histConf">'+optsC+'</select></label></div>'+
    '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px" class="no-print">'+
      '<input type="checkbox" data-act="histAtual"'+(incluirAtual?" checked":"")+' style="width:15px;height:15px">'+
      'Incluir o mês em apuração ('+esc(nomeMes(compAtual()))+') na comparação</label>';

  var comDados=serieC.filter(function(p){ return p.pontos!=null; });
  if(comDados.length<1){
    h += '<div class="aviso neutro" style="margin-top:10px">Sem registros de '+esc(nomeSel)+' nos meses guardados.</div>';
  } else {
    if(comDados.length===1){
      h += '<div class="aviso neutro" style="margin-top:10px">Só há um mês com dados para '+esc(nomeSel)+
        '. Guarde outros meses no histórico para ver a evolução.</div>';
    }
    /* variação entre o primeiro e o último mês com dados */
    var pri=comDados[0], ult=comDados[comDados.length-1];
    var varP = pri.pontos>0 ? ((ult.pontos-pri.pontos)/pri.pontos*100) : null;
    var varU = pri.un>0 ? ((ult.un-pri.un)/pri.un*100) : null;
    var seta=function(v){ return v==null?"—":(v>0?"▲ +":(v<0?"▼ ":"= "))+dec(Math.abs(v),1)+"%"; };
    var corV=function(v){ return v==null?"#64748B":(v>0?"#166534":(v<0?"#B91C1C":"#64748B")); };
    /* potencial: melhor mês já registrado */
    var pot = selC==="__equipe" ? potencialEquipe() : potencialDe(selC);
    var pctPot = (pot && pot.pontos>0) ? (ult.pontos/pot.pontos*100) : null;

    h += '<div class="kpis" style="margin-top:10px">'+
      '<div class="kpi"><span>Pontos · '+esc(mesCurto(ult.comp))+'</span><b class="num">'+inte(ult.pontos)+'</b></div>'+
      '<div class="kpi"><span>Variação de pontos</span><b class="num" style="color:'+corV(varP)+'">'+seta(varP)+'</b></div>'+
      '<div class="kpi"><span>Unidades · '+esc(mesCurto(ult.comp))+'</span><b class="num">'+inte(ult.un)+'</b></div>'+
      '<div class="kpi"><span>Variação de unidades</span><b class="num" style="color:'+corV(varU)+'">'+seta(varU)+'</b></div>'+
      (pot ? '<div class="kpi" style="border-color:#DDD6FE;background:#FAF8FF"><span>Potencial '+
        (pot.equipe?'(soma dos melhores)':'('+esc(mesCurto(pot.comp))+')')+'</span>'+
        '<b class="num" style="color:#6D28D9">'+inte(pot.pontos)+' pts</b></div>'+
        '<div class="kpi"><span>Do potencial atingido</span><b class="num" style="color:'+
        (pctPot>=100?"#166534":(pctPot>=85?"#B45309":"#B91C1C"))+'">'+dec(pctPot,1)+'%</b></div>' : '')+'</div>'+
      (pot ? '<div class="aviso '+(ult.pontos>=pot.pontos?"ok":"neutro")+'" style="margin-top:2px">'+
        (ult.pontos>=pot.pontos
          ? 'Melhor desempenho já registrado — o potencial de '+esc(nomeSel)+' subiu para '+inte(ult.pontos)+' pontos.'
          : (pot.equipe
              ? 'Somando o melhor mês de cada conferente, a equipe tem potencial de <b>'+inte(pot.pontos)+' pontos</b>. '+
                'Faltam <b>'+inte(Math.max(0,pot.pontos-ult.pontos))+'</b> para chegar lá.'
              : 'O melhor mês de '+esc(nomeSel)+' foi '+esc(nomeMes(pot.comp))+', com <b>'+inte(pot.pontos)+' pontos</b> e '+
                inte(pot.un)+' unidades. Faltam <b>'+inte(Math.max(0,pot.pontos-ult.pontos))+' pontos</b> para voltar a esse nível.'))+
        '</div>' : '');

    h += '<div style="display:grid;gap:16px;grid-template-columns:1fr" class="evitar-quebra">'+
      '<div>'+graficoLinha(serieC.map(function(p){ return {rotulo:p.rotulo, valor:p.pontos, comp:p.comp}; }),
        {cor:"#1C63C7", corAnt:"#F2811B", titulo:"Pontuação — "+nomeSel, fmt:inte,
         ref: pot?pot.pontos:null, corRef:"#7C3AED",
         refRotulo: pot?("Potencial "+inte(pot.pontos)+" pts"):"",
         legRef: pot?("potencial — "+mesCurto(pot.comp)):""})+'</div>'+
      '<div>'+graficoLinha(serieC.map(function(p){ return {rotulo:p.rotulo, valor:p.un, comp:p.comp}; }),
        {cor:"#17948F", corAnt:"#B4009E", titulo:"Unidades conferidas — "+nomeSel, fmt:inte,
         ref: pot?pot.un:null, corRef:"#7C3AED",
         refRotulo: pot?("Potencial "+inte(pot.un)+" un"):"",
         legRef: pot?("potencial — "+mesCurto(pot.comp)):""})+'</div></div>';

    /* tabela de apoio */
    h += '<div class="tabela-wrap" style="margin-top:12px"><table class="tabela tab"><thead><tr><th>Mês</th>'+
      '<th class="n">Pontos</th><th class="n">O.S.</th><th class="n">Unidades</th>'+
      '<th class="n">Unid. por O.S.</th></tr></thead><tbody>';
    serieC.forEach(function(p){
      if(p.pontos==null){
        h += '<tr><td>'+esc(nomeMes(p.comp))+(p.atual?' <span style="font-size:10px;color:var(--suave)">(em apuração)</span>':'')+
          '</td><td class="n" colspan="4" style="color:var(--suave)">sem registro</td></tr>';
        return;
      }
      h += '<tr><td><b>'+esc(nomeMes(p.comp))+'</b>'+(p.atual?' <span style="font-size:10px;color:var(--suave)">(em apuração)</span>':'')+'</td>'+
        '<td class="n"><b>'+inte(p.pontos)+'</b></td><td class="n">'+inte(p.os||0)+'</td>'+
        '<td class="n">'+inte(p.un||0)+'</td>'+
        '<td class="n">'+dec(p.os>0?p.un/p.os:0)+'</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '<div style="display:flex;gap:8px;margin-top:12px" class="no-print">'+
    '<button class="btn" data-act="csvEvol" style="padding:6px 12px;font-size:12px">Exportar evolução</button>'+
    '<button class="btn" data-act="imprimirHist" style="padding:6px 12px;font-size:12px">Imprimir</button></div></div>';

  /* detalhe de um mês */
  var sel = S.histSel && S.historico[S.histSel] ? S.histSel : comps[0];
  var m = S.historico[sel];
  var opts = comps.map(function(k){ return '<option value="'+k+'"'+(k===sel?" selected":"")+'>'+esc(nomeMes(k))+'</option>'; }).join("");
  h += '<div class="card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;justify-content:space-between">'+
    '<label class="campo no-print" style="max-width:280px;margin:0"><span>Mês do histórico</span>'+
      '<select data-act="histSel">'+opts+'</select></label>'+
    '<div style="display:flex;gap:8px" class="no-print">'+
      '<button class="btn" data-act="csvHist" style="padding:6px 12px;font-size:12px">Exportar mês</button>'+
      '<button class="btn perigo" data-act="remHist" style="padding:6px 12px;font-size:12px">Remover mês</button>'+
    '</div></div>'+
    '<h2 class="disp" style="margin-top:10px">'+esc(nomeMes(sel))+'</h2>'+
    '<p class="ajuda">'+esc(m.arquivo||"")+(m.inicio?' · '+dBR(m.inicio)+' a '+dBR(m.fim):'')+
    ' · guardado em '+dBR(m.importadoEm)+'</p>';

  var itens=m.itens.slice().sort(function(a,b){ return b.pontos-a.pontos; });
  var atualPorMat={}; S.conferentes.forEach(function(c){ if(c.matricula) atualPorMat[String(c.matricula).trim()]=c; });
  h += '<div class="tabela-wrap"><table class="tabela tab"><thead><tr><th>#</th><th>Conferente</th>'+
    '<th class="n">Pontos</th><th class="n">O.S.</th><th class="n">Unidades</th>'+
    '<th class="n">Faixa no mês</th><th class="n">Prêmio</th></tr></thead><tbody>';
  var totP=0, totV=0;
  itens.forEach(function(i,idx){
    var f=faixaDe(i.pontos), v=i.pontos*f.valor; totP+=i.pontos; totV+=v;
    h += '<tr><td class="num" style="color:var(--suave)">'+(idx+1)+'</td>'+
      '<td><b>'+esc(i.nome)+'</b>'+(i.matricula&&i.matricula!=="—"?'<div style="font-size:11px;color:var(--suave)">'+esc(i.matricula)+'</div>':'')+'</td>'+
      '<td class="n"><b>'+inte(i.pontos)+'</b></td><td class="n">'+inte(i.os||0)+'</td><td class="n">'+inte(i.un||0)+'</td>'+
      '<td class="n" style="font-size:11px">'+esc(f.label)+'<br>R$ '+dec(f.valor,2)+'</td>'+
      '<td class="n">'+brl(v)+'</td></tr>';
  });
  h += '<tr style="background:#F8FAFC"><td></td><td><b>Total</b></td><td class="n"><b>'+inte(totP)+'</b></td>'+
    '<td></td><td></td><td></td><td class="n"><b>'+brl(totV)+'</b></td></tr></tbody></table></div>'+
    '<p class="ajuda" style="margin-top:10px">Os valores usam a tabela de faixas atual, para comparação direta com o mês corrente.</p></div>';
  return h;
}

function baixarCSVEvol(){
  var incluirAtual = S.histAtual!==false;
  var comps=Object.keys(S.historico||{}).sort();
  if(incluirAtual && comps.indexOf(compAtual())<0) comps.push(compAtual());
  var cab=["Conferente","Matricula"];
  comps.forEach(function(k){ cab.push(nomeMes(k)+" pontos"); cab.push(nomeMes(k)+" unidades"); });
  var linhasCsv=[cab];
  conferentesHistorico().forEach(function(c){
    var s2=serieHistorico(c.chave, incluirAtual), lin=[c.nome, c.matricula||""];
    s2.forEach(function(p){ lin.push(p.pontos==null?"":p.pontos); lin.push(p.un==null?"":p.un); });
    linhasCsv.push(lin);
  });
  var eq=serieHistorico("__equipe", incluirAtual), linEq=["TOTAL DA EQUIPE",""];
  eq.forEach(function(p){ linEq.push(p.pontos==null?"":p.pontos); linEq.push(p.un==null?"":p.un); });
  linhasCsv.push(linEq);
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var t=String(c); return /[;"\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url; a.download="evolucao-conferentes.csv"; a.click();
  URL.revokeObjectURL(url);
}

function baixarCSVHist(){
  var sel=S.histSel && S.historico[S.histSel] ? S.histSel : Object.keys(S.historico||{}).sort().reverse()[0];
  var m=S.historico[sel]; if(!m) return;
  var linhasCsv=[["Competencia","Matricula","Conferente","Pontos","OS","Unidades","Faixa","R$/ponto","Premio"]];
  m.itens.slice().sort(function(a,b){return b.pontos-a.pontos;}).forEach(function(i){
    var f=faixaDe(i.pontos);
    linhasCsv.push([sel,i.matricula,i.nome,i.pontos,i.os||0,i.un||0,f.label,dec(f.valor,2),dec(i.pontos*f.valor,2)]);
  });
  var csv=linhasCsv.map(function(r){ return r.map(function(c){
    var s=String(c); return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }).join(";"); }).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url; a.download="historico-"+sel+".csv"; a.click();
  URL.revokeObjectURL(url);
}
/* ====================== ABA CONFIGURAÇÃO ====================== */
function abaConfig(){
  var ctx=contexto(), c=S.config, F=getFaixas();

  var h = '<div class="card"><h2 class="disp">Período de apuração</h2>'+
    '<p class="ajuda">Os dias úteis restantes contam a partir da data de hoje, inclusive. Os dias corridos vão '+
    'do início do período até ontem — é sobre eles que o ritmo diário é calculado.</p><div class="grade">'+
    '<label class="campo"><span>Início</span><input type="date" data-act="cfg" data-campo="inicio" value="'+c.inicio+'"></label>'+
    '<label class="campo"><span>Fim</span><input type="date" data-act="cfg" data-campo="fim" value="'+c.fim+'"></label>'+
    '<label class="campo"><span>Hoje (automático)</span>'+
      '<input type="date" value="'+c.hoje+'" disabled title="Preenchido automaticamente com a data do sistema">'+
      '<small style="font-size:11px;color:var(--suave)">Data do sistema · '+dBR(c.hoje)+'</small></label>'+
    '</div><label style="display:flex;gap:8px;align-items:center;font-size:14px">'+
    '<input type="checkbox" data-act="sabado"'+(c.sabadoUtil?" checked":"")+' style="width:16px;height:16px">'+
    'Contar sábado como dia útil</label>'+
    '<div class="aviso neutro num">'+ctx.decorridos+' dias úteis já trabalhados · '+ctx.restantes+
    ' dias úteis até o fechamento. · Competência atual: '+esc(nomeMes(compAtual()))+'</div></div>';

  /* ---------- METAS / FAIXAS ---------- */
  h += '<div class="card"><h2 class="disp">Metas de premiação (faixas)</h2>'+
    '<p class="ajuda">Cada faixa é uma meta: a partir de um mínimo de pontos, define quanto vale cada ponto (R$). '+
    'Crie uma nova meta ou altere as existentes. O máximo de cada faixa é calculado sozinho pelo início da faixa seguinte; '+
    'a última faixa vale para essa pontuação ou mais.</p>'+
    '<div class="tabela-wrap"><table class="tabela tab"><thead><tr>'+
      '<th>Meta</th><th class="n" style="width:120px">A partir de (pts)</th><th class="n" style="width:120px">R$ por ponto</th>'+
      '<th class="n" style="width:110px">'+dec(pctBonusCfg(),0)+'% sem erro</th>'+
      '<th class="n">Faixa</th><th class="no-print" style="width:40px"></th></tr></thead><tbody>';
  F.forEach(function(f,i){
    h += '<tr><td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:'+f.cor+';margin-right:6px;vertical-align:middle"></span>'+
      '<b>'+(i===0?"Base":"Meta "+i)+'</b></td>'+
      '<td class="n"><input type="number" min="0" step="1" data-act="faixaMin" data-i="'+i+'" value="'+f.min+'"'+
        (i===0?' disabled title="A base começa sempre em 0"':'')+' style="width:100%;text-align:right;padding:5px 6px"></td>'+
      '<td class="n"><input type="number" min="0" step="0.05" data-act="faixaValor" data-i="'+i+'" value="'+f.valor+'" style="width:100%;text-align:right;padding:5px 6px"></td>'+
      '<td class="n pos-v">'+(f.valor>0?'R$ '+dec(f.valor*(1+pctBonusCfg()/100),2):'—')+'</td>'+
      '<td class="n" style="font-size:12px;color:var(--suave)">'+esc(f.label)+' pts</td>'+
      '<td class="no-print">'+(i===0?'':'<button class="mini" data-act="faixaRem" data-i="'+i+'" title="Remover meta">✕</button>')+'</td></tr>';
  });
  h += '</tbody></table></div>'+
    '<div style="display:flex;gap:8px;margin-top:10px">'+
      '<button class="btn" data-act="faixaAdd">Criar nova meta</button>'+
      '<button class="btn" data-act="faixaReset">Restaurar faixas padrão</button></div></div>';

  /* ---------- META PADRÃO DA EQUIPE ---------- */
  h += '<div class="card"><h2 class="disp">Meta padrão da equipe</h2>'+
    '<p class="ajuda">Alvo usado no feedback e nas metas individuais quando não há meta digitada por conferente. '+
    'Zero faz o painel usar a próxima faixa de cada um como alvo.</p>'+
    '<label class="campo" style="max-width:280px"><span>Meta padrão em pontos (0 = próxima faixa)</span>'+
    '<input type="number" data-act="metaPadrao" value="'+c.metaPadrao+'"></label><div class="pilulas">';
  getFaixas().slice(1).forEach(function(f){ h+='<button data-act="metaRapida" data-v="'+f.min+'">'+f.min+' pts</button>'; });
  h += '<button data-act="metaRapida" data-v="0">próxima faixa</button></div></div>';

  /* ---------- REGRAS DE PONTUAÇÃO ---------- */
  h += '<div class="card"><h2 class="disp">Regras de pontuação</h2>'+
    '<p class="ajuda">Como o conferente ganha pontos. Esses valores aparecem por escrito no termo de feedback.</p>'+
    '<div class="grade">'+
      '<label class="campo"><span>O.S. conferidas por ponto</span>'+
        '<input type="number" min="1" step="1" data-act="cfgNum" data-campo="osPorPonto" value="'+osPorPonto()+'"></label>'+
      '<label class="campo"><span>Itens conferidos por ponto</span>'+
        '<input type="number" min="1" step="1" data-act="cfgNum" data-campo="itensPorPonto" value="'+itensPorPonto()+'"></label>'+
      '<label class="campo"><span>Pontos por carga transportada</span>'+
        '<input type="number" min="1" step="1" data-act="cfgNum" data-campo="pontosPorCarga" value="'+pontosPorCarga()+'"></label>'+
      '<label class="campo"><span>Bônus sem nenhum erro (%)</span>'+
        '<input type="number" min="0" step="1" data-act="pctBonus" value="'+pctBonusCfg()+'"></label>'+
    '</div></div>';

  /* ---------- DESCONTO POR ERRO ---------- */
  var base=pontosPorErro();
  h += '<div class="card"><h2 class="disp">Desconto por erro</h2>'+
    '<p class="ajuda">Penalidade progressiva: o 1º erro desconta '+inte(base)+' pontos, o 2º desconta '+inte(base*2)+
    ', o 3º '+inte(base*3)+', e assim por diante.</p>'+
    '<label class="campo" style="max-width:280px"><span>Pontos descontados no 1º erro</span>'+
    '<input type="number" min="1" step="1" data-act="ptsErro" value="'+base+'"></label></div>';

  /* ---------- PARÂMETROS DE TEMPO ---------- */
  h += '<div class="card"><h2 class="disp">Análise de tempos</h2>'+
    '<p class="ajuda">Como o painel interpreta o relatório 8635 na aba <b>Tempos</b>.</p>'+
    '<div class="grade">'+
      '<label class="campo"><span>Intervalo mínimo para contar como ocioso (min)</span>'+
        '<input type="number" min="0" step="1" data-act="cfgNum" data-campo="gapMin" value="'+gapMinimo()+'"></label>'+
      '<label class="campo"><span>Duração máxima de uma O.S. (min)</span>'+
        '<input type="number" min="10" step="10" data-act="cfgNum" data-campo="durMaxOS" value="'+duracaoMax()+'"></label>'+
    '</div>'+
    '<p class="ajuda" style="margin:0">Acima da duração máxima, a O.S. é tratada como esquecida em aberto e '+
    'fica fora da mediana de tempo.</p></div>';

  /* ---------- IMPORTAÇÃO ---------- */
  h += blocoImportar();

  /* ---------- RECOMEÇAR ---------- */
  h += '<div class="card"><h2 class="disp">Recomeçar</h2>'+
    '<p class="ajuda">Volta as regras, o período e as faixas de premiação para o padrão. '+
    'A equipe, os lançamentos, o histórico e a qualidade são mantidos.</p>'+
    '<button class="btn perigo" data-act="restaurar">Restaurar configuração padrão</button></div>';
  return h;
}

/* ====================== IMPORTAÇÃO ====================== */
function semAcento(s){ return String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(); }
function chaveCol(s){ return semAcento(s).replace(/[^A-Z0-9]/g,""); }
function chaveNome(s){ return semAcento(s).replace(/\s+/g," ").trim(); }
function paraISO(v){
  if(v instanceof Date && !isNaN(v)){
    var p=function(n){return String(n).padStart(2,"0");};
    return v.getFullYear()+"-"+p(v.getMonth()+1)+"-"+p(v.getDate());
  }
  if(typeof v==="number" && v>20000){
    var d=new Date(Math.round((v-25569)*86400)*1000);
    return paraISO(new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  }
  var t=String(v||"").trim(), m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return m[1]+"-"+m[2]+"-"+m[3];
  m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if(m) return m[3]+"-"+m[2]+"-"+m[1];
  return "";
}
/* Data e hora -> ISO "YYYY-MM-DDTHH:MM" (mantém o horário, ao contrário de paraISO) */
function paraISOHora(v){
  var p=function(n){return String(n).padStart(2,"0");};
  if(v instanceof Date && !isNaN(v))
    return v.getFullYear()+"-"+p(v.getMonth()+1)+"-"+p(v.getDate())+"T"+p(v.getHours())+":"+p(v.getMinutes());
  if(typeof v==="number" && v>20000){
    var ms=Math.round((v-25569)*86400000), d=new Date(ms);
    return d.getUTCFullYear()+"-"+p(d.getUTCMonth()+1)+"-"+p(d.getUTCDate())+"T"+p(d.getUTCHours())+":"+p(d.getUTCMinutes());
  }
  var t=String(v||"").trim();
  var m=t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if(m) return m[1]+"-"+m[2]+"-"+m[3]+"T"+m[4]+":"+m[5];
  m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})[T ]?(\d{2})?:?(\d{2})?/);
  if(m) return m[3]+"-"+m[2]+"-"+m[1]+"T"+(m[4]||"00")+":"+(m[5]||"00");
  var d2=paraISO(v); return d2 ? d2+"T00:00" : "";
}
function minutosEntre(a,b){ return (new Date(b).getTime()-new Date(a).getTime())/60000; }
function hhmm(min){
  min=Math.max(0,Math.round(Number(min)||0));
  var h=Math.floor(min/60), m=min%60;
  return h>0 ? h+"h"+String(m).padStart(2,"0") : m+"min";
}

function lerCSV(txt){
  var linhasTxt = txt.replace(/^\uFEFF/,"").split(/\r?\n/).filter(function(l){return l.trim()!=="";});
  if(!linhasTxt.length) return [];
  var sep = (linhasTxt[0].split(";").length > linhasTxt[0].split(",").length) ? ";" : ",";
  var cab = linhasTxt[0].split(sep).map(function(c){return c.trim().replace(/^"|"$/g,"");});
  return linhasTxt.slice(1).map(function(l){
    var v=l.split(sep), o={};
    cab.forEach(function(c,i){ o[c]=(v[i]||"").trim().replace(/^"|"$/g,""); });
    return o;
  });
}
function processarDados(dados,nomeArq){
  if(!dados.length){ S.msg={tipo:"erro",texto:"O arquivo está vazio."}; return render(); }
  var cols=Object.keys(dados[0]);
  var achar=function(){ var alvos=[].slice.call(arguments);
    for(var i=0;i<cols.length;i++){ if(alvos.indexOf(chaveCol(cols[i]))>=0) return cols[i]; } return null; };

  /* Relatório de tempos (8635): uma linha por O.S. com INICIO e FIM → vai para Tempos */
  if(achar("INICIO") && achar("FIM") && achar("CONFERENTE") && achar("NUMOS")){
    return processarTempos(dados, nomeArq, achar);
  }

  /* Relatório de ocorrências (8630): uma linha por O.S. → vai para Qualidade */
  if(achar("NUMOS","NUMEROOS","NROOS") && (achar("TEVEOCORRENCIA") || achar("QTDOCORRENCIAS"))){
    return processarQualidade(dados, nomeArq, achar);
  }
  var kMat=achar("MATRICULA","MAT","CODIGO","CHAPA");
  var kNome=achar("NOME","COLABORADOR","FUNCIONARIO","CONFERENTE");
  var kPts=achar("PONTOS","PONTUACAO","PONTO");
  var kOs=achar("NUMERO","QTOS","OS","ORDENS","QTDOS");
  var kUn=achar("NUMERO2","QTUN","UNIDADES","UNID","QTDUN");
  var kD1=achar("DATA1","DATAINICIO","INICIO","DATAINICIAL");
  var kD2=achar("DATA2","DATAFIM","FIM","DATAFINAL");
  if(!kNome||!kPts){
    S.msg={tipo:"erro",texto:"Não encontrei as colunas NOME e PONTOS. Colunas lidas: "+cols.join(", ")};
    return render();
  }
  var porMat={}, porNome={};
  S.conferentes.forEach(function(c){
    if(c.matricula) porMat[String(c.matricula).trim()]=c;
    porNome[chaveNome(c.nome)]=c;
  });
  var vistos={};
  var linhasPrev = dados.map(function(r){
    var nome=String(r[kNome]||"").trim(); if(!nome) return null;
    var mat = kMat ? String(r[kMat]||"").trim() : "";
    var pts = Number(String(r[kPts]).replace(",",".")) || 0;
    var atual = (mat && porMat[mat]) || porNome[chaveNome(nome)] || null;
    if(atual) vistos[atual.id]=true;
    return {
      id: atual?atual.id:null,
      nome: atual?atual.nome:nome.toUpperCase(),
      matricula: mat || (atual?atual.matricula:"—"),
      fpts: pts,                                  /* pontos do arquivo (cru) */
      atual: atual?atual.pontos:null,             /* pontos já registrados */
      os: kOs ? (Number(r[kOs])||0) : (atual?atual.os:0),
      un: kUn ? (Number(r[kUn])||0) : (atual?atual.un:0)
    };
  }).filter(Boolean).sort(function(a,b){return b.fpts-a.fpts;});

  var fileInicio = kD1 ? paraISO(dados[0][kD1]) : "";
  var fileFim    = kD2 ? paraISO(dados[0][kD2]) : "";
  var fileComp   = competenciaDe(fileInicio) || competenciaDe(fileFim) || compAtual();
  var mesmoMes   = fileComp === compAtual();

  S.previa = {
    linhas: linhasPrev, arquivo: nomeArq,
    inicio: fileInicio, fim: fileFim,
    competencia: fileComp, mesmoMes: mesmoMes,
    modo: mesmoMes ? "somar" : "historico",   /* mesmo mês soma; outro mês vai p/ histórico */
    zerarErros: !mesmoMes,                     /* se virar o mês, zera erros por padrão */
    ausentes: S.conferentes.filter(function(c){ return c.ativo && !vistos[c.id]; })
  };
  S.msg=null;
  render();
}
/* ---------- Relatório 8630: ocorrências por O.S. ---------- */
function processarQualidade(dados, nomeArq, achar){
  var kMat=achar("MATRICULA","MAT","CHAPA"), kNome=achar("NOME","CONFERENTE","COLABORADOR");
  var kOS=achar("NUMOS","NUMEROOS","NROOS"), kTeve=achar("TEVEOCORRENCIA"), kQtd=achar("QTDOCORRENCIAS");
  var kData=achar("DATAMOVIMENTO","DATA","DTMOVIMENTO");
  /* coluna com o tipo/status da ocorrência — permite contar as sobras */
  var kTipo=achar("STATUS","TIPOOCORRENCIA","TIPO","OCORRENCIA","DESCRICAOOCORRENCIA","DESCRICAO",
                  "MOTIVO","SITUACAO","TIPODIVERGENCIA","DIVERGENCIA");
  if(!kNome || !kOS){
    S.msg={tipo:"erro",texto:"Não encontrei as colunas NOME e NUMOS. Colunas lidas: "+Object.keys(dados[0]).join(", ")};
    return render();
  }
  var mapa={}, datas=[], vistasOS={}, vistasSobra={}, temSobras=false;
  dados.forEach(function(r){
    var nome=String(r[kNome]||"").trim();
    var mat=kMat?String(r[kMat]||"").split(".")[0].trim():"";
    var os=String(r[kOS]==null?"":r[kOS]).trim();
    if(!nome || !os) return;
    if(/^NAOUSAR$/i.test(nome) || mat==="1") return;      /* linha técnica do sistema */
    var chave = mat || chaveNome(nome);
    var m = mapa[chave] || (mapa[chave]={matricula:mat||"—", nome:nome.toUpperCase(), osConf:0, osOcor:0, qtdOcor:0, osSobra:0});
    var chaveOS = chave+"|"+os;
    /* SOBRA: conta O.S. distintas cujo status indica sobra (a linha pode repetir por ocorrência) */
    if(kTipo && /SOBRA/i.test(semAcento(r[kTipo]||""))){
      if(!vistasSobra[chaveOS]){ vistasSobra[chaveOS]=true; m.osSobra++; temSobras=true; }
    }
    if(vistasOS[chaveOS]) return;                          /* não conta a mesma O.S. duas vezes */
    vistasOS[chaveOS]=true;
    m.osConf++;
    var teve = kTeve ? /^S/i.test(String(r[kTeve]||"").trim()) : (Number(r[kQtd])>0);
    var qtd  = kQtd ? (Number(r[kQtd])||0) : (teve?1:0);
    if(teve){ m.osOcor++; m.qtdOcor+=qtd; }
    if(kData){ var d=paraISO(r[kData]); if(d) datas.push(d); }
  });
  var itens=Object.keys(mapa).map(function(k){
    var m=mapa[k]; m.pct = m.osConf>0 ? (m.osOcor/m.osConf*100) : 0; return m;
  });
  if(!itens.length){ S.msg={tipo:"erro",texto:"Não encontrei conferentes válidos nesse arquivo."}; return render(); }
  datas.sort();
  var ini=datas[0]||"", fim=datas[datas.length-1]||"";
  var comp=competenciaDe(ini)||compAtual();
  S.previaQual={ itens:itens, arquivo:nomeArq, inicio:ini, fim:fim, competencia:comp,
                 mesmoMes: comp===compAtual(), temSobras:temSobras, colTipo:kTipo||"" };
  S.previa=null; S.msg=null; render();
}
function gravarQualidade(){
  var p=S.previaQual; if(!p) return;
  if(!S.qualidade) S.qualidade={};
  S.qualidade[p.competencia]={ competencia:p.competencia, arquivo:p.arquivo, inicio:p.inicio, fim:p.fim,
    importadoEm:hojeISO(), itens:p.itens, temSobras:!!p.temSobras };
  /* preenche as sobras automaticamente quando o arquivo traz o status e é do mês em apuração */
  var nSob=0;
  if(p.temSobras && p.competencia===compAtual()){
    p.itens.forEach(function(i){
      var c=conferenteAtivoDe(i); if(!c) return;
      c.sobras=Number(i.osSobra)||0; nSob+=c.sobras;
    });
  }
  var totOS=0,totOc=0; p.itens.forEach(function(i){ totOS+=i.osConf; totOc+=i.osOcor; });
  S.msg={tipo:"ok",texto:"Qualidade de "+nomeMes(p.competencia)+" importada: "+p.itens.length+
    " conferentes, "+inte(totOS)+" O.S. e "+inte(totOc)+" com ocorrência"+
    (p.temSobras && p.competencia===compAtual() ? ". Sobras preenchidas automaticamente ("+inte(nSob)+" no total)." :
      (p.mesmoMes?"." : " (mês diferente do painel — visível ao mudar a competência)."))};
  S.previaQual=null; salvar(); render();
}

function lerArquivo(file){
  S.msg=null; S.previa=null;
  var ext=(file.name.split(".").pop()||"").toLowerCase();
  var leitor=new FileReader();
  leitor.onload=function(ev){
    try{
      if(ext==="csv"){ processarDados(lerCSV(ev.target.result), file.name); return; }
      if(typeof XLSX==="undefined"){
        S.msg={tipo:"erro",texto:"A biblioteca de leitura de Excel não carregou (sem internet). Salve a planilha como .csv e envie de novo."};
        return render();
      }
      var wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
      var ws=wb.Sheets[wb.SheetNames[0]];
      processarDados(XLSX.utils.sheet_to_json(ws,{defval:""}), file.name);
    }catch(e){
      S.msg={tipo:"erro",texto:"Não consegui ler esse arquivo. Envie o .xls, .xlsx ou .csv exportado do sistema."};
      render();
    }
  };
  if(ext==="csv") leitor.readAsText(file,"ISO-8859-1"); else leitor.readAsArrayBuffer(file);
}
/* Calcula como cada linha fica de acordo com o modo escolhido */
function previewLinha(l,modo){
  var atual=l.atual, fpts=l.fpts, novo, delta, status;
  if(modo==="historico"){ return {novo:fpts, antes:null, delta:null, status:"historico"}; }
  if(modo==="somar"){ novo=(atual||0)+fpts; delta=fpts; status=l.id?"atualizado":"novo"; }
  else if(modo==="substituir"){ novo=fpts; delta=(atual!=null)?fpts-atual:null; status=l.id?(fpts===atual?"igual":"atualizado"):"novo"; }
  else { /* reiniciar */ novo=fpts; delta=null; status=l.id?"reinicia":"novo"; }
  return {novo:novo, antes:atual, delta:delta, status:status};
}
function arquivarNoHistorico(comp, arquivo, itens, ini, fim){
  if(!S.historico) S.historico={};
  S.historico[comp]={ competencia:comp, arquivo:arquivo||"", inicio:ini||"", fim:fim||"",
    importadoEm:hojeISO(), itens:itens };
}
function gravarImportacao(){
  var p=S.previa; if(!p) return;
  var modo=p.modo, porId={};
  p.linhas.forEach(function(l){ if(l.id) porId[l.id]=l; });

  /* HISTÓRICO: guarda o mês e não encosta no painel */
  if(modo==="historico"){
    arquivarNoHistorico(p.competencia, p.arquivo,
      p.linhas.map(function(l){ return {matricula:l.matricula, nome:l.nome, pontos:l.fpts, os:l.os, un:l.un}; }),
      p.inicio, p.fim);
    S.msg={tipo:"ok",texto:nomeMes(p.competencia)+" guardado no histórico ("+p.linhas.length+
      " conferentes). O painel continua em "+nomeMes(compAtual())+", sem alteração."};
    S.previa=null; salvar(); render(); return;
  }

  if(modo==="reiniciar"){
    /* antes de virar o mês, arquiva o mês que está fechando */
    var compAnt=compAtual();
    if(compAnt && compAnt!==p.competencia){
      arquivarNoHistorico(compAnt, S.config.arquivo||"", S.conferentes.filter(function(c){return c.ativo;})
        .map(function(c){ return {matricula:c.matricula, nome:c.nome, pontos:c.pontos, os:c.os, un:c.un}; }),
        S.config.inicio, S.config.fim);
    }
    /* novo mês: todo mundo começa do zero; quem veio no arquivo recebe os pontos do arquivo */
    S.conferentes = S.conferentes.map(function(c){
      var n=porId[c.id];
      var base=Object.assign({}, c, {pontosAnt:null, pontos:0, os:0, un:0});
      base.cargas=0;   /* cargas são do mês */
      if(p.zerarErros){ base.erros=0; base.sobras=0; }
      if(n) base=Object.assign(base,{pontos:n.fpts, os:n.os, un:n.un,
        matricula:(c.matricula && c.matricula!=="—")?c.matricula:n.matricula});
      return base;
    });
    S.config.competencia = p.competencia || compAtual();
  } else {
    /* mesmo mês: somar ao total ou substituir os que vieram no arquivo */
    S.conferentes = S.conferentes.map(function(c){
      var n=porId[c.id]; if(!n) return c;
      var r=previewLinha(n,modo);
      return Object.assign({},c,{ pontosAnt:c.pontos, pontos:r.novo, os:n.os, un:n.un,
        matricula:(c.matricula && c.matricula!=="—")?c.matricula:n.matricula });
    });
  }

  var novos = p.linhas.filter(function(l){ return !l.id; });
  if(S.addNovos){
    novos.forEach(function(l,i){
      S.conferentes.push({id:"c"+Date.now()+"-"+i, matricula:l.matricula, nome:l.nome, pontos:l.fpts,
        os:l.os, un:l.un, meta:0, ativo:true, obs:"", pontosAnt:null, erros:0, sobras:0, cargas:0});
    });
  }
  S.config.ultimaImportacao=new Date().toISOString().slice(0,10);
  S.config.arquivo=p.arquivo;
  if(S.usarDatas && p.inicio) S.config.inicio=p.inicio;
  if(S.usarDatas && p.fim) S.config.fim=p.fim;
  if(S.usarDatas && p.competencia) S.config.competencia=p.competencia;

  var qtdAtu = p.linhas.filter(function(l){return l.id;}).length;
  var acao = modo==="reiniciar" ? ("Novo mês ("+nomeMes(p.competencia)+"): pontuação reiniciada")
           : modo==="somar" ? "Pontuação somada ao mês" : "Pontuação substituída";
  S.msg={tipo:"ok",texto:acao+" — "+qtdAtu+" conferentes"+
    (S.addNovos && novos.length ? " e "+novos.length+" cadastrados agora" : "")+
    (modo==="reiniciar" && p.zerarErros ? ", erros zerados" : "")+"."};
  S.previa=null;
  salvar(); render();
}

/* ====================== CSV DE SAÍDA ====================== */
function baixarCSV(){
  var ctx=contexto();
  var linhasCsv=[["Posicao","Matricula","Nome","Pontos brutos","Erros","Pontos descontados","Pontos validos",
    "Faixa","R$/ponto","Premio sem erros","Valor por pontos","Bonus sem erro","Premio a pagar","Perda","Meta",
    "Faltam p/ meta","Pts por dia p/ meta","Ritmo atual","Projecao fim do mes"]];
  linhas().forEach(function(l,i){
    linhasCsv.push([i+1,l.matricula,l.nome,l.pontosBrutos,l.qtdErros,l.pontosDescontados,l.pontos,
      l.faixa.label,dec(l.faixa.valor,2),dec(l.valorBruto,2),dec(l.valorAtual,2),
      dec(l.bonusSemErro,2),dec(l.valorFinal,2),dec(l.desconto,2),
      l.meta,l.faltamMeta,dec(l.porDiaMeta),dec(l.ritmo),Math.round(l.projecao)]);
  });
  var csv=linhasCsv.map(function(r){return r.join(";");}).join("\n");
  var url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  var a=document.createElement("a"); a.href=url; a.download="pontuacao-conferencia.csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ====================== RENDER ====================== */
var ABAS=[["painel","Painel"],["conferentes","Conferentes"],
          ["metas","Metas"],["acomp","Acompanhamento"],["qualidade","Qualidade"],
          ["lanc","Erros e transportadora"],["tempos","Tempos"],["historico","Histórico"],["feedback","Feedback"],["config","Configuração"]];
/* Faixa fixa no topo (vidro): período em apuração e os filtros da tela aberta */
var telaLarga = window.matchMedia("(min-width: 761px)");
function filtrosDaAba(){
  var ctx=contexto(), cfg=S.config;
  var resumo = '<span class="resumo-periodo"><b>'+esc(nomeMes(compAtual()))+'</b> · '+dBR(cfg.inicio)+' a '+dBR(cfg.fim)+
    ' · <b class="num">'+ctx.restantes+'</b> dias úteis restantes</span>';
  var campos = "";
  if(S.aba==="tempos" && S.tempos && S.tempos.regs && S.tempos.regs.length){
    var T=S.tempos, fIni=S.tFiltroIni||T.inicio, fFim=S.tFiltroFim||T.fim, ordem=S.tOrdem||"pctOcioso";
    campos = '<div class="grade-filtros">'+
      '<div class="campo"><label for="f-ini">De</label><input id="f-ini" type="date" data-act="tFiltro" data-campo="tFiltroIni" value="'+esc(fIni)+'" min="'+esc(T.inicio)+'" max="'+esc(T.fim)+'"></div>'+
      '<div class="campo"><label for="f-fim">Até</label><input id="f-fim" type="date" data-act="tFiltro" data-campo="tFiltroFim" value="'+esc(fFim)+'" min="'+esc(T.inicio)+'" max="'+esc(T.fim)+'"></div>'+
      '<div class="campo"><label for="f-ordem">Ordenar por</label><select id="f-ordem" data-act="tOrdem">'+
        opt2("pctOcioso","% de tempo ocioso",ordem)+opt2("ocioso","Tempo ocioso total",ordem)+
        opt2("durMed","Tempo por O.S. (mediana)",ordem)+opt2("os","O.S. finalizadas",ordem)+
        opt2("maiorGap","Maior intervalo",ordem)+'</select></div></div>'+
      '<div class="btns">'+
        '<button class="btn secundario pequeno" data-act="tPeriodo" data-v="tudo">Todo o arquivo</button>'+
        '<button class="btn secundario pequeno" data-act="tPeriodo" data-v="mes">Mês em apuração</button>'+
        '<button class="btn secundario pequeno" data-act="tPeriodo" data-v="7">Últimos 7 dias</button>'+
        '<label class="check"><input type="checkbox" data-act="tSoAtivos"'+(S.tSoAtivos===false?"":" checked")+'>Só a equipe atual</label>'+
      '</div>';
  }
  else if(S.aba==="feedback" && !S.imprimirTodos){
    var ls=linhas(), atual=null;
    for(var i=0;i<ls.length;i++){ if(ls[i].id===S.sel) atual=ls[i]; }
    if(!atual) atual=ls[0];
    if(atual) campos = '<div class="grade-filtros"><div class="campo"><label for="f-sel">Colaborador</label><select id="f-sel" data-act="sel">'+
      ls.map(function(x){ return '<option value="'+x.id+'"'+(x.id===atual.id?" selected":"")+'>'+esc(x.nome)+' — '+x.pontos+' pts</option>'; }).join("")+
      '</select></div></div>';
  }
  else if(S.aba==="painel"){
    campos = '<div class="btns"><button class="btn secundario pequeno" data-act="csv">Baixar CSV</button></div>';
  }
  return {resumo:resumo, campos:campos};
}
function renderFiltros(){
  var f=filtrosDaAba(), caixa=document.getElementById("filtros");
  if(!caixa) return;
  var aberto = telaLarga.matches || S.filtrosAbertos;
  caixa.innerHTML = '<details class="filtros-fixos no-print'+(f.campos?"":" sem-campos")+'"'+(aberto?" open":"")+'>'+
    '<summary>'+f.resumo+'</summary>'+
    '<div class="filtros-linha">'+(telaLarga.matches?f.resumo:"")+f.campos+'</div></details>';
  caixa.querySelector("details").addEventListener("toggle", function(ev){
    if(!telaLarga.matches) S.filtrosAbertos = ev.target.open;
  });
}
telaLarga.addEventListener("change", function(){ renderFiltros(); });

function render(){
  renderFiltros();
  var app=document.getElementById("app");
  if(S.aba==="painel") app.innerHTML=abaPainel();
  else if(S.aba==="conferentes") app.innerHTML=abaConferentes();
  else if(S.aba==="metas") app.innerHTML=abaMetas();
  else if(S.aba==="acomp") app.innerHTML=abaAcomp();
  else if(S.aba==="lanc") app.innerHTML=abaLancamentos();
  else if(S.aba==="qualidade") app.innerHTML=abaQualidade();
  else if(S.aba==="tempos") app.innerHTML=abaTempos();
  else if(S.aba==="historico") app.innerHTML=abaHistorico();
  else if(S.aba==="feedback") app.innerHTML=abaFeedback();
  else app.innerHTML=abaConfig();
}

function acharConf(id){ for(var i=0;i<S.conferentes.length;i++){ if(S.conferentes[i].id===id) return S.conferentes[i]; } return null; }

/* A tela aberta vem do menu do sistema (#aba=...) */
var ABAS_VALIDAS = ABAS.map(function(a){ return a[0]; });
function abaDoEndereco(){
  var m = location.hash.match(/aba=([\w-]+)/);
  return m && ABAS_VALIDAS.indexOf(m[1])>=0 ? m[1] : "painel";
}
window.addEventListener("hashchange", function(){
  var k=abaDoEndereco();
  if(k!==S.aba){ S.aba=k; S.msg=null; render(); window.scrollTo(0,0); }
});

/* Chamado por app.js com os dados da planilha */
window.iniciarPainel = function(dados){
  S.aba = abaDoEndereco();
  S.conferentes = (dados && dados.conferentes) || [];
  S.config = (dados && dados.config) ? Object.assign({}, CONFIG_PADRAO, dados.config) : cfgPadrao();
  S.conferentes.forEach(function(c){
    if(typeof c.erros!=="number") c.erros=0;
    if(typeof c.sobras!=="number") c.sobras=0;
    if(typeof c.cargas!=="number") c.cargas=0;
  });
  if(S.config.faixas && S.config.faixas.length) S.config.faixas=normalizarFaixas(S.config.faixas);
  S.qualidade = (dados && dados.qualidade) || {};
  S.historico = (dados && dados.historico) || {};
  S.tempos = (dados && dados.tempos) || null;
  if(S.tempos){ S.tFiltroIni=S.tempos.inicio; S.tFiltroFim=S.tempos.fim; }
  S.config.hoje = hojeISO();   /* sempre a data do sistema */
  render();
};

document.addEventListener("click", function(e){
  var al=e.target.closest("[data-act]"); if(!al) return;
  var act=al.getAttribute("data-act"), id=al.getAttribute("data-id");
  if(act==="abrir"){ S.aberto = (S.aberto===id ? null : id); render(); }
  else if(act==="csv"){ e.stopPropagation(); baixarCSV(); }
  else if(act==="novo"){
    var nome=document.getElementById("nNome").value.trim();
    if(!nome){ alert("Informe o nome do conferente."); return; }
    S.conferentes.push({ id:"c"+Date.now(), matricula:document.getElementById("nMat").value.trim()||"—",
      nome:nome.toUpperCase(), pontos:Number(document.getElementById("nPts").value)||0,
      os:Number(document.getElementById("nOs").value)||0, un:Number(document.getElementById("nUn").value)||0,
      meta:Number(document.getElementById("nMeta").value)||0, ativo:true, obs:"", pontosAnt:null, erros:0, sobras:0, cargas:0 });
    S.msg="Conferente adicionado à equipe."; salvar(); render();
  }
  else if(act==="remover"){
    var c=acharConf(id);
    if(c && confirm("Remover "+c.nome+" da lista? Essa ação não volta.")){
      S.conferentes=S.conferentes.filter(function(x){return x.id!==id;}); salvar(); render();
    }
  }
  else if(act==="metaRapida"){ S.config.metaPadrao=Number(al.getAttribute("data-v")); salvar(); render(); }
  else if(act==="faixaAdd"){
    var F=getFaixas().map(function(f){return {min:f.min,valor:f.valor};});
    var ult=F[F.length-1];
    F.push({min:(ult.min||0)+50, valor:ult.valor});
    S.config.faixas=normalizarFaixas(F); salvar(); render();
  }
  else if(act==="faixaRem"){
    var idx=Number(al.getAttribute("data-i"));
    var F2=getFaixas().map(function(f){return {min:f.min,valor:f.valor};});
    if(idx>0){ F2.splice(idx,1); S.config.faixas=normalizarFaixas(F2); salvar(); render(); }
  }
  else if(act==="faixaReset"){
    if(confirm("Restaurar as faixas de premiação para o padrão original?")){
      S.config.faixas=null; salvar(); render();
    }
  }
  else if(act==="zerarLanc"){
    if(confirm("Zerar erros, sobras e cargas de todos os conferentes?")){
      S.conferentes.forEach(function(c){ c.erros=0; c.sobras=0; c.cargas=0; });
      S.msg={tipo:"ok",texto:"Lançamentos zerados."}; salvar(); render();
    }
  }
  else if(act==="csvLanc"){ baixarCSVLanc(); }
  else if(act==="csvAcomp"){ baixarCSVAcomp(); }
  else if(act==="csvPareto"){ baixarCSVPareto(); }
  else if(act==="csvTempo"){ baixarCSVTempo(); }
  else if(act==="tDet"){ S.tDet = (S.tDet===id ? null : id); render();
    setTimeout(function(){ var e=document.getElementById("detTempo");
      if(e && e.scrollIntoView) e.scrollIntoView({behavior:"smooth",block:"start"}); }, 60); }
  else if(act==="tFechaDet"){ S.tDet=null; render(); }
  else if(act==="csvDetTempo"){ baixarCSVDetTempo(); }
  else if(act==="imprimirDet"){
    document.body.classList.add("so-detalhe");
    window.print();
    setTimeout(function(){ document.body.classList.remove("so-detalhe"); }, 400);
  }
  else if(act==="imprimirTempo"){ window.print(); }
  else if(act==="gravarTempo"){ gravarTempos(); }
  else if(act==="cancelarTempo"){ S.previaTempo=null; S.msg=null; render(); }
  else if(act==="tPeriodo"){
    var v=al.getAttribute("data-v"), T=S.tempos; if(!T) return;
    if(v==="tudo"){ S.tFiltroIni=T.inicio; S.tFiltroFim=T.fim; }
    else if(v==="mes"){
      S.tFiltroIni = S.config.inicio>T.inicio ? S.config.inicio : T.inicio;
      S.tFiltroFim = S.config.fim<T.fim ? S.config.fim : T.fim;
    } else {
      var dias=Number(v)||7, d=new Date(T.fim+"T00:00");
      d.setDate(d.getDate()-(dias-1));
      var p2=function(n){return String(n).padStart(2,"0");};
      var ini=d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
      S.tFiltroIni = ini<T.inicio ? T.inicio : ini; S.tFiltroFim=T.fim;
    }
    render();
  }
  else if(act==="imprimirAcomp"){ window.print(); }
  else if(act==="gravar"){ gravarImportacao(); }
  else if(act==="cancelar"){ S.previa=null; render(); }
  else if(act==="imprimir"){ window.print(); }
  else if(act==="imprimirTodos"){
    S.imprimirTodos=true; render();
    setTimeout(function(){ window.print(); S.imprimirTodos=false; render(); }, 60);
  }
  else if(act==="copiar"){
    var ctx2=contexto(), ls=linhas(), l=null;
    for(var i=0;i<ls.length;i++){ if(ls[i].id===S.sel) l=ls[i]; }
    if(!l) l=ls[0];
    var txt=textoTermo(l,ctx2,S.config);
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ S.msg="Texto copiado."; render(); })
        .catch(function(){ prompt("Copie o texto do termo:", txt); });
    } else prompt("Copie o texto do termo:", txt);
  }
  else if(act==="gravarQual"){ gravarQualidade(); }
  else if(act==="cancelarQual"){ S.previaQual=null; S.msg=null; render(); }
  else if(act==="csvQual"){ baixarCSVQual(); }
  else if(act==="imprimirQual"){ window.print(); }
  else if(act==="csvHist"){ baixarCSVHist(); }
  else if(act==="csvEvol"){ baixarCSVEvol(); }
  else if(act==="imprimirHist"){ window.print(); }
  else if(act==="remHist"){
    var sel=S.histSel && S.historico[S.histSel] ? S.histSel : Object.keys(S.historico||{}).sort().reverse()[0];
    if(sel && confirm("Remover "+nomeMes(sel)+" do histórico?")){
      delete S.historico[sel]; S.histSel=""; salvar(); render();
    }
  }
  else if(act==="restaurar"){
    if(confirm("Voltar as regras, o período e as faixas para o padrão? A equipe e os lançamentos são mantidos.")){
      S.config=cfgPadrao(); salvar(); render();
    }
  }
});

document.addEventListener("change", function(e){
  var al=e.target.closest("[data-act]"); if(!al) return;
  var act=al.getAttribute("data-act");
  if(act==="upd"){
    var c=acharConf(al.getAttribute("data-id")); if(!c) return;
    var campo=al.getAttribute("data-campo"), v=al.value;
    c[campo] = (campo==="nome"||campo==="matricula"||campo==="obs") ? v : (Number(v)||0);
    salvar(); render();
  }
  else if(act==="ativo"){ var a=acharConf(al.getAttribute("data-id")); if(a){ a.ativo=al.checked; salvar(); render(); } }
  else if(act==="metaPadrao"){ S.config.metaPadrao=Number(al.value)||0; salvar(); render(); }
  else if(act==="cfg"){ var campo=al.getAttribute("data-campo"); S.config[campo]=al.value;
    if(campo==="inicio" && competenciaDe(al.value)) S.config.competencia=competenciaDe(al.value);
    salvar(); render(); }
  else if(act==="sabado"){ S.config.sabadoUtil=al.checked; salvar(); render(); }
  else if(act==="sel"){ S.sel=al.value; S.msg=null; render(); }
  else if(act==="histSel"){ S.histSel=al.value; render(); }
  else if(act==="paretoMet"){ S.paretoMet=al.value; render(); }
  else if(act==="tFiltro"){ S[al.getAttribute("data-campo")]=al.value; render(); }
  else if(act==="tOrdem"){ S.tOrdem=al.value; render(); }
  else if(act==="tSoAtivos"){ S.tSoAtivos=al.checked; render(); }
  else if(act==="histConf"){ S.histConf=al.value; render(); }
  else if(act==="histAtual"){ S.histAtual=al.checked; render(); }
  else if(act==="ptsErro"){
    S.config.pontosPorErro = Math.max(1, Math.round(Number(String(al.value).replace(",","."))||0));
    salvar(); render();
  }
  else if(act==="cfgNum"){
    var cp=al.getAttribute("data-campo");
    S.config[cp]=Math.max(1, Math.round(Number(String(al.value).replace(",","."))||0));
    salvar(); render();
  }
  else if(act==="pctBonus"){
    S.config.bonusSemErro = Math.max(0, Number(String(al.value).replace(",","."))||0);
    salvar(); render();
  }
  else if(act==="faixaMin"){
    var i=Number(al.getAttribute("data-i"));
    var F=getFaixas().map(function(f){return {min:f.min,valor:f.valor};});
    if(F[i] && i>0){ F[i].min=Math.max(1,Math.round(Number(al.value)||0)); S.config.faixas=normalizarFaixas(F); salvar(); render(); }
  }
  else if(act==="faixaValor"){
    var iv=Number(al.getAttribute("data-i"));
    var Fv=getFaixas().map(function(f){return {min:f.min,valor:f.valor};});
    if(Fv[iv]){ Fv[iv].valor=Math.max(0,Number(String(al.value).replace(",","."))||0); S.config.faixas=normalizarFaixas(Fv); salvar(); render(); }
  }
  else if(act==="addNovos"){ S.addNovos=al.checked; }
  else if(act==="usarDatas"){ S.usarDatas=al.checked; }
  else if(act==="modoImport"){ if(S.previa){ S.previa.modo=al.value;
    if(al.value!=="reiniciar") S.previa.zerarErros=false;
    else S.previa.zerarErros=!S.previa.mesmoMes; render(); } }
  else if(act==="zerarErrosImp"){ if(S.previa){ S.previa.zerarErros=al.checked; } }
  else if(act==="arquivo"){ if(al.files && al.files[0]) lerArquivo(al.files[0]); }
});

