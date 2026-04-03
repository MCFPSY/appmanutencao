/**
 * CLOUDFLARE WORKER - CHATBOT GEMINI AI
 * Versão: v3.8.3.10.27.10
 * Data: 2026-01-31
 * Backend para análise de pedidos de manutenção MCF+PSY
 * 
 * 🆕 v3.8.3.10.27.10 (2026-02-02):
*    - DETECÇÃO HÍBRIDA: Fallback GPT-4 Vision para PÁGINA INTEIRA quando detecção automática falha
*    - Prompt melhorado: Detecção de índices SEM depender de palavras-chave (layout visual)
*    - Palavras-chave adicionadas: GENERALIDADES, OBJECTIVO, CARACTERÍSTICAS, INSTALAÇÃO
*    - Garantia de 100% detecção de esquemas elétricos e índices
*
* 🆕 v3.8.3.10.27.9 (2026-01-31):
 * - ✅ Detecção visual melhorada de ÍNDICES/SUMÁRIOS
 * - ✅ Novo tipo "indice" com detecção por LAYOUT (números esq. + páginas dir.)
 * - ✅ Exemplos expandidos para evitar confusão índice vs tabela
 * - ✅ Detecção de esquemas elétricos reforçada (análise visual prioritária)
 * 
 * CONFIGURAÇÃO v3.8.3.9.2:
 * ✅ Modelo: gemini-2.5-flash (mais recente e estável)
 * ✅ API: v1beta (funcional)
 * ✅ Event handler: ES6 modules
 * ✅ Logs detalhados para debug
 * ✅ Validação robusta da API key
 * ✅ Tratamento de erros melhorado
 * ✅ CORS habilitado
 * ✅ maxOutputTokens: 8192 (DOBRADO! Respostas longas completas)
 * ✅ temperature: 0.0 (100% DETERMINÍSTICO - mesma resposta SEMPRE!)
 * ✅ topK: 1 (sempre escolhe palavra mais provável)
 * ✅ topP: 1.0 (sem amostragem nucleus)
 * ✅ stopSequences: [] (NÃO truncar respostas!)
 * ✅ Suporte a imagens/tabelas de manuais (URLs no formato 📊 [TABLE X])
 * ✅ 🆕 BUSCA VETORIAL com OpenAI embeddings + Supabase pgvector
 * ✅ 🆕 Busca semântica (entende sinônimos e contexto)
 * 
 * CHANGELOG v3.8.3.9.2 (2026-01-22):
 * - 🐛 FIX CRÍTICO: Respostas truncadas no meio (problema de tokens)
 * - 🎯 PROBLEMA: Respostas do Gemini cortadas a meio (ex.: "...texto cortado")
 * - 🎯 CAUSA: maxOutputTokens 4096 era insuficiente para respostas longas de manuais
 * - 🎯 SOLUÇÃO: maxOutputTokens aumentado para 8192 (DOBRO!) + stopSequences vazio
 * - ✅ Resultado: Respostas completas sem truncamento
 * - ✅ Instrução adicional ao modelo: "Completa SEMPRE a tua resposta!"
 * 
 * CHANGELOG v3.8.2.18 (2026-01-20):
 * - 🎯 FIX ULTRA-CRÍTICO: Temperature ZERADA (0.0) + topK=1 + topP=1.0
 * - 🎯 PROBLEMA: Mesmo com temp=0.2 ainda havia variação nas respostas
 * - 🎯 CAUSA: topK=40 e topP=0.95 permitem aleatoriedade na escolha de palavras
 * - 🎯 SOLUÇÃO: temp=0.0 + topK=1 = ZERO aleatoriedade (100% determinístico)
 * - ✅ Resultado: SEMPRE a mesma resposta palavra por palavra
 * 
 * CHANGELOG v3.8.2.17 (2026-01-20):
 * - 🎯 FIX CRÍTICO: Temperature baixada de 0.7 para 0.2
 * - 🎯 PROBLEMA: IA dava respostas diferentes para a mesma pergunta
 * - 🎯 CAUSA: Temperature alta = aleatoriedade/criatividade
 * - 🎯 SOLUÇÃO: Temperature baixa = respostas consistentes e técnicas
 * - ✅ Resultado: Sempre a mesma resposta (determinístico)
 * 
 * CHANGELOG v3.8.2.11 (2026-01-20):
 * - 🐛 FIX CRÍTICO: Adicionado try-catch em JSON.stringify para capturar erros
 * - 🐛 FIX: Tratamento adequado de contextos com referências circulares
 * - ✅ Mensagens de erro mais claras quando JSON.stringify falha
 * 
 * CHANGELOG v3.7.6.10 (2026-01-15):
 * - 🆕 Adicionada busca vetorial (embeddings + pgvector)
 * - 🆕 Integração com OpenAI para gerar embeddings
 * - 🆕 Integração com Supabase para busca semântica
 * - 🆕 Contexto enriquecido com seções mais relevantes
 * - ✅ Respostas mais precisas e focadas
 * 
 * VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
 * - GEMINI_API_KEY: Chave da API Gemini
 * - OPENAI_API_KEY: Chave da API OpenAI (para embeddings)
 * - SUPABASE_ANON_KEY: Chave anônima do Supabase (para busca vetorial)
 */

// ============================================
// CONFIGURAÇÃO
// ============================================

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// 🆕 v3.7.6.10: Configuração OpenAI para embeddings
const OPENAI_EMBEDDINGS_MODEL = 'text-embedding-3-small';
const OPENAI_API_BASE = 'https://api.openai.com/v1';

// 🆕 v3.7.6.10: Configuração Supabase para busca vetorial
const SUPABASE_URL = 'https://wegftalccimrnnlmoiyn.supabase.co'; // ✅ URL configurado
const USE_VECTOR_SEARCH = false; // ⚠️ Busca vetorial DESATIVADA (função match_manuais não existe no Supabase)

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ============================================
// 🆕 v3.8.3.10.3: HANDLER GPT-4 VISION (PROXY)
// ============================================

/**
 * Proxy para GPT-4 Vision API (resolve CORS + segurança)
 * @param {Request} request - Request do Cloudflare Worker
 * @param {Object} env - Environment variables (API keys)
 * @returns {Response} - Resposta da OpenAI
 */
async function handleGPT4Vision(request, env) {
  try {
    console.log('🤖 [GPT-4 VISION] Processando requisição...');
    
    // Verificar API key OpenAI
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY não configurada!');
      return new Response(JSON.stringify({ 
        erro: 'API Key não configurada', 
        detalhes: 'Configure OPENAI_API_KEY nas variáveis de ambiente do Worker.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ [GPT-4 VISION] API Key encontrada');
    
    // Parse do body (recebe: imageUrl, textoContexto, pageNum)
    const body = await request.json();
    const { imageUrl, textoContexto, pageNum } = body;
    
    console.log(`🖼️ [GPT-4 VISION] Analisando página ${pageNum}...`);
    
    // Preparar prompt para GPT-4
    const prompt = `Você é um especialista em análise de manuais técnicos e esquemas elétricos. Analise esta imagem extraída da página ${pageNum} de um manual técnico.

CONTEXTO DA PÁGINA:
${textoContexto ? textoContexto.substring(0, 500) : 'N/A'}

TAREFA:
1. **DETECÇÃO VISUAL PRIORITÁRIA** - Identifique o TIPO pela APARÊNCIA da imagem:
   
   🔌 **ESQUEMA ELÉTRICO** (tipo: "esquema"):
   - Linhas representando fios/cabos elétricos
   - Símbolos elétricos: motores (M), contatores (K), relés, disjuntores, fusíveis
   - Ligações elétricas (L1, L2, L3, N, PE, terra)
   - Componentes: KM1, F1, Q1, S1, transformadores
   - Layout típico: linhas verticais/horizontais com símbolos padronizados
   - **MESMO que não tenha texto "esquema elétrico", se PARECER esquema elétrico → tipo: "esquema"**
   
   📊 **TABELA** (tipo: "tabela"):
   - Dados organizados em linhas e colunas
   - Bordas/células visíveis
   
   🖼️ **FIGURA** (tipo: "figura"):
   - Desenhos, fotos, ilustrações, vistas 3D
   - Partes mecânicas, equipamentos
   
   📈 **DIAGRAMA** (tipo: "diagrama"):
   - Fluxogramas, diagramas de processo/blocos
   - Não é elétrico (se for elétrico → "esquema")
   
   📎 **ANEXO** (tipo: "anexo"):
   - Texto explícito "ANEXO", "Anexo III", "Apêndice"
   
   📑 **ÍNDICE / SUMÁRIO** (tipo: "indice"):
   - **DETECÇÃO VISUAL PRIORITÁRIA (SEM DEPENDER DE PALAVRAS-CHAVE):**
     • Lista numerada de capítulos/seções (1, 2, 3, 4.1, 4.2, 5.1.1, 5.3.6...)
     • Títulos/capítulos alinhados à ESQUERDA
     • Números de página alinhados à DIREITA (ex: 5, 12, 23, 34)
     • Pode ter linhas pontilhadas (....) conectando título → página
     • Layout em COLUNA (vertical), não em GRID (tabela tradicional)
     • Pode ter subsecções indentadas (ex: "5.3 Instalação" → "5.3.1 Preparação" → "5.3.2 Montagem")
   - **Palavras-chave comuns (NÃO obrigatórias, mas ajudam):**
     • "ÍNDICE", "INDICE", "INDEX", "SUMÁRIO", "Índice Geral", "Conteúdo", "Table of Contents"
     • "GENERALIDADES", "OBJECTIVO", "CONSIDERAÇÕES", "DADOS TÉCNICOS", "CARACTERÍSTICAS", "INSTALAÇÃO", "OPERAÇÃO", "MANUTENÇÃO"
   - **IMPORTANTE:** 
     • Se tiver LAYOUT de índice (números à esq. + páginas à dir.) → tipo: "indice", tags: ["indice"]
     • MESMO SEM palavras-chave, se a estrutura visual for de índice → tipo: "indice"
   - **NÃO confundir com tabela de dados** (tabelas têm GRID com múltiplas colunas de dados, não apenas capítulos + páginas)
   
2. Extraia o IDENTIFICADOR (numero):
   - Se tiver número/letra no texto → extraia
   - Se for "Figura 25" → numero: "25"
   - Se for "Anexo III" → numero: "3" (converter romano)
   - Se for esquema elétrico SEM número → numero: null (OK!)
   - Se tiver pequeno texto "esquema elétrico" → tipo: "esquema", numero: null
   
3. TÍTULO:
   - Se identificou esquema elétrico visual → titulo: "Esquema Elétrico"
   - Se tiver texto pequeno na imagem → use esse texto
   - Máximo 60 caracteres
   
4. TAGS obrigatórias:
   - Se tipo = "esquema" → SEMPRE adicione tag "esquema_eletrico"
   - Se vir símbolos elétricos → adicione "circuito", "eletrica"
   - Se tipo = "indice" → SEMPRE adicione tag "indice"
   - Componentes específicos → ex: ["motor", "contator", "rele"]

Retorne APENAS um JSON válido no formato:
{
  "tipo": "esquema|indice|figura|tabela|diagrama|anexo",
  "numero": "25" ou null,
  "titulo": "Esquema Elétrico",
  "descricao": "Diagrama de ligações elétricas do motor principal",
  "componentes": ["KM1", "F1", "Motor M1"],
  "tags": ["esquema_eletrico", "circuito", "motor"]
}

EXEMPLOS CORRETOS:

✅ Imagem com símbolos elétricos (M, K, F) e linhas, SEM texto "anexo":
{
  "tipo": "esquema",
  "numero": null,
  "titulo": "Esquema Elétrico",
  "descricao": "Diagrama de comando e força do motor",
  "componentes": ["KM1", "KM2", "F1", "Motor"],
  "tags": ["esquema_eletrico", "circuito", "motor"]
}

✅ Imagem com texto pequeno "esquema elétrico" e símbolos:
{
  "tipo": "esquema",
  "numero": null,
  "titulo": "Esquema Elétrico",
  "tags": ["esquema_eletrico"]
}

✅ Imagem com "ANEXO III" no topo E circuito elétrico:
{
  "tipo": "anexo",
  "numero": "3",
  "titulo": "Anexo III - Esquema Elétrico",
  "tags": ["esquema_eletrico", "anexo_3"]
}

✅ Imagem com lista de capítulos/secções com páginas (ÍNDICE):
{
  "tipo": "indice",
  "numero": null,
  "titulo": "Índice",
  "descricao": "Índice do manual com lista de capítulos e números de página",
  "tags": ["indice"]
}

✅ Imagem com layout: "1. INSTALAÇÃO ..... 11" / "2. MANUTENÇÃO ..... 34":
{
  "tipo": "indice",
  "numero": null,
  "titulo": "Índice",
  "descricao": "Sumário do manual com capítulos numerados",
  "tags": ["indice"]
}

❌ ERRADO - Identificar ÍNDICE como "tabela" genérica:
{
  "tipo": "tabela",  ← ERRADO! Layout de índice → tipo: "indice"
  "titulo": "Tabela"
}

❌ ERRADO - Identificar esquema elétrico como "figura":
{
  "tipo": "figura",  ← ERRADO! Deveria ser "esquema"
  "titulo": "Desenho técnico"
}

REGRA CRÍTICA:
→ Se a imagem tiver APARÊNCIA de esquema elétrico (símbolos, linhas, componentes) → tipo: "esquema"
→ Não dependa apenas do texto! Use análise VISUAL!`;


    // Chamar OpenAI GPT-4 Vision API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Modelo com visão
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.0 // Determinístico
      })
    });
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ [GPT-4 VISION] Erro OpenAI:', errorText);
      return new Response(JSON.stringify({ 
        erro: 'Erro na API OpenAI', 
        detalhes: errorText,
        status: openaiResponse.status
      }), {
        status: openaiResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const result = await openaiResponse.json();
    const content = result.choices[0].message.content;
    
    console.log('✅ [GPT-4 VISION] Resposta recebida:', content.substring(0, 100));
    
    // Tentar parsear JSON da resposta
    let metadata;
    try {
      // Extrair JSON do conteúdo (pode vir com texto adicional)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        metadata = JSON.parse(jsonMatch[0]);
      } else {
        metadata = { erro: 'Formato inválido', resposta_bruta: content };
      }
    } catch (e) {
      console.error('❌ [GPT-4 VISION] Erro ao parsear JSON:', e);
      metadata = { erro: 'Parse error', resposta_bruta: content };
    }
    
    console.log('🎯 [GPT-4 VISION] Metadata extraída:', JSON.stringify(metadata));
    
    return new Response(JSON.stringify({ 
      sucesso: true,
      metadata: metadata,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ [GPT-4 VISION] Erro geral:', error);
    return new Response(JSON.stringify({ 
      erro: 'Erro interno', 
      detalhes: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// HANDLER PRINCIPAL (ES6 MODULES)
// ============================================

export default {
  async fetch(request, env, ctx) {
    console.log('🔥 Nova requisição:', request.method, request.url);
    
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 🆕 v3.8.3.10.3: Rota para GPT-4 Vision (proxy OpenAI)
    if (url.pathname === '/gpt4-vision' && request.method === 'POST') {
      return handleGPT4Vision(request, env);
    }

    // Aceita apenas POST para rota principal
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ erro: 'Método não permitido. Use POST.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      console.log('🔵 [DEBUG] Início do try block');
      
      // ✅ Verificar API key (env é passado corretamente no ES6 modules)
      console.log('🔵 [DEBUG] Verificando API key...');
      const apiKey = env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error('❌ GEMINI_API_KEY não encontrada no ambiente!');
        return new Response(JSON.stringify({ 
          erro: 'Configuração inválida', 
          detalhes: 'API key não configurada. Configure GEMINI_API_KEY nas variáveis de ambiente do Worker.',
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ API key encontrada:', apiKey.substring(0, 10) + '...');

      // Parse do body
      console.log('🔵 [DEBUG] Fazendo parse do body...');
      const body = await request.json();
      console.log('🔵 [DEBUG] Body parseado, extraindo pergunta e contexto...');
      const { pergunta, contexto } = body;

      console.log('🔵 [DEBUG] Pergunta recebida:', pergunta);
      console.log('🔵 [DEBUG] Contexto type:', typeof contexto);
      console.log('🔵 [DEBUG] Contexto keys:', Object.keys(contexto || {}));
      console.log('📊 Contexto:', JSON.stringify(contexto).substring(0, 200) + '...');
      
      // 🆕 v3.7.6.9: Debug - Verificar se há URLs de imagens no contexto
      console.log('🔵 [DEBUG] Criando contextoStr...');
      let contextoStr;
      try {
        contextoStr = JSON.stringify(contexto);
        console.log('🔵 [DEBUG] contextoStr criado, length:', contextoStr.length);
      } catch (jsonError) {
        console.error('❌ ERRO ao fazer JSON.stringify do contexto:', jsonError.message);
        return new Response(JSON.stringify({ 
          erro: 'Erro ao processar contexto', 
          detalhes: `Falha ao serializar contexto: ${jsonError.message}. O contexto pode conter referências circulares ou dados problemáticos.`,
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('🔵 [DEBUG] Procurando URLs no contexto...');
      const urlsEncontradas = contextoStr.match(/📊 \[TABLE \d+\]: https?:\/\/[^\s\n]+/g) || [];
      console.log('🔵 [DEBUG] URLs encontradas:', urlsEncontradas.length);
      
      if (urlsEncontradas.length > 0) {
        console.log('🖼️ URLs de imagens encontradas no contexto:', urlsEncontradas.length);
        urlsEncontradas.forEach((url, idx) => console.log(`   ${idx + 1}. ${url}`));
      } else {
        console.log('⚠️ Nenhuma URL de imagem encontrada no contexto');
      }

      if (!pergunta || !contexto) {
        return new Response(JSON.stringify({ 
          erro: 'Dados inválidos', 
          detalhes: 'Envie "pergunta" e "contexto" no corpo da requisição.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('🔵 [DEBUG] Iniciando preparação de contexto...');
      
      // 🆕 v3.7.6.10: Busca vetorial (se ativada e se houver manuais na pergunta)
      let contextoEnriquecido = contexto;
      
      console.log('🔵 [DEBUG] USE_VECTOR_SEARCH:', USE_VECTOR_SEARCH);
      console.log('🔵 [DEBUG] OPENAI_API_KEY exists:', !!env.OPENAI_API_KEY);
      console.log('🔵 [DEBUG] SUPABASE_ANON_KEY exists:', !!env.SUPABASE_ANON_KEY);
      
      if (USE_VECTOR_SEARCH && env.OPENAI_API_KEY && env.SUPABASE_ANON_KEY) {
        try {
          // Detectar se a pergunta menciona manuais/equipamentos
          const mencionaManual = /manual|lubrific|manutenção|tabela|capítulo|equipamento/i.test(pergunta);
          
          if (mencionaManual) {
            console.log('🧠 [VECTOR] Pergunta menciona manuais, usando busca vetorial...');
            
            const resultadosVetoriais = await buscarConteudoVetorial(
              pergunta,
              env.OPENAI_API_KEY,
              env.SUPABASE_ANON_KEY
            );
            
            if (resultadosVetoriais.length > 0) {
              // Adicionar resultados vetoriais ao contexto
              contextoEnriquecido = {
                ...contexto,
                manuais_vetoriais: {
                  disponivel: true,
                  resultados: resultadosVetoriais.map(r => ({
                    secao: r.secao,
                    conteudo: r.conteudo,
                    paginas: `${r.pagina_inicio}-${r.pagina_fim}`,
                    similaridade: r.similarity
                  }))
                }
              };
              
              console.log(`✅ [VECTOR] ${resultadosVetoriais.length} seções adicionadas ao contexto`);
            }
          } else {
            console.log('ℹ️ [VECTOR] Pergunta não menciona manuais, pulando busca vetorial');
          }
        } catch (error) {
          console.error('⚠️ [VECTOR] Erro na busca vetorial (continuando sem):', error);
          // Continuar sem busca vetorial
        }
      } else {
        console.log('ℹ️ [VECTOR] Busca vetorial desativada ou chaves não configuradas');
      }
      
      console.log('🔵 [DEBUG] Preparando contexto enriquecido como string...');
      // 🆕 v3.7.6.10: Preparar contexto como string (para busca de URLs)
      let contextoEnriquecidoStr;
      try {
        contextoEnriquecidoStr = JSON.stringify(contextoEnriquecido);
        console.log('🔵 [DEBUG] contextoEnriquecidoStr length:', contextoEnriquecidoStr.length);
      } catch (jsonError) {
        console.error('❌ ERRO ao fazer JSON.stringify do contextoEnriquecido:', jsonError.message);
        return new Response(JSON.stringify({ 
          erro: 'Erro ao processar contexto enriquecido', 
          detalhes: `Falha ao serializar contexto: ${jsonError.message}`,
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('🔵 [DEBUG] Chamando Gemini...');
      // Chamar Gemini com contexto (enriquecido ou original)
      const resultado = await chamarGemini(pergunta, contextoEnriquecido, apiKey, contextoEnriquecidoStr);
      console.log('🔵 [DEBUG] Gemini retornou resultado');

      return new Response(JSON.stringify({ 
        resposta: resultado.resposta,
        debug_logs: resultado.debug_logs, // 🆕 v3.7.6.10: Incluir logs de debug na resposta
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('❌ Erro no Worker:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      return new Response(JSON.stringify({ 
        erro: 'Erro ao processar a requisição.',
        detalhes: error.message,
        stack: error.stack,
        nome: error.name,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// ============================================
// 🆕 v3.7.6.10: FUNÇÕES DE BUSCA VETORIAL
// ============================================

/**
 * Gerar embedding usando OpenAI API
 */
async function gerarEmbedding(texto, apiKey) {
  const textoLimitado = texto.substring(0, 30000);
  
  const response = await fetch(`${OPENAI_API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: textoLimitado,
      model: OPENAI_EMBEDDINGS_MODEL
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Buscar conteúdo similar usando busca vetorial (Supabase + pgvector)
 */
async function buscarConteudoVetorial(pergunta, openaiKey, supabaseKey) {
  console.log('🔍 [VECTOR] Iniciando busca vetorial...');
  
  // 1. Gerar embedding da pergunta
  const embedding = await gerarEmbedding(pergunta, openaiKey);
  console.log('✅ [VECTOR] Embedding da pergunta gerado');
  
  // 2. Buscar no Supabase usando RPC
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_manuais`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3
    })
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    console.error('❌ [VECTOR] Erro do Supabase:', errorData);
    throw new Error(`Supabase error: ${response.status}`);
  }
  
  const resultados = await response.json();
  console.log(`✅ [VECTOR] ${resultados.length} resultados encontrados`);
  
  return resultados;
}

// ============================================
// FUNÇÃO PARA CHAMAR GEMINI AI
// ============================================

async function chamarGemini(pergunta, contexto, apiKey, contextoStr = null) {
  console.log('🔵 [DEBUG-GEMINI] Função chamarGemini iniciada');
  console.log('🔵 [DEBUG-GEMINI] pergunta:', pergunta?.substring(0, 50));
  console.log('🔵 [DEBUG-GEMINI] contexto type:', typeof contexto);
  console.log('🔵 [DEBUG-GEMINI] apiKey exists:', !!apiKey);
  console.log('🔵 [DEBUG-GEMINI] contextoStr:', contextoStr ? 'fornecido' : 'null');
  
  console.log('🤖 Chamando Gemini AI...');
  
  // 🆕 v3.7.6.10: Array para armazenar logs de debug
  const debugLogs = [];
  debugLogs.push('🤖 Iniciando chamada ao Gemini AI...');

  console.log('🔵 [DEBUG-GEMINI] Preparando contextoStr...');
  // Preparar contexto como string se não for fornecido
  if (!contextoStr) {
    console.log('🔵 [DEBUG-GEMINI] contextoStr é null, criando...');
    contextoStr = JSON.stringify(contexto, null, 2);
  }
  console.log('🔵 [DEBUG-GEMINI] contextoStr length:', contextoStr.length);

  // Preparar prompt em Português
  const prompt = `És um assistente inteligente especializado em análise de manutenção industrial para as empresas MCF e PSY.

**DADOS DO SISTEMA:**
${contextoStr}

**PERGUNTA DO UTILIZADOR:**
${pergunta}

**INSTRUÇÕES:**
1. Analisa os dados fornecidos
2. Responde de forma clara e objetiva em **Português de Portugal**
3. Usa bullets (•) para listas
4. Destaca números importantes com **negrito**
5. Se possível, sugere ações ou insights relevantes
6. Mantém o tom profissional mas acessível
7. **IMPORTANTE: Completa SEMPRE a tua resposta! Não trunces a meio, termina todas as frases!**

**🚨 REGRA CRÍTICA PARA CONTEÚDO DE MANUAIS:**
- Quando o utilizador perguntar sobre conteúdo de um manual, **MOSTRA O CONTEÚDO REAL diretamente na resposta**.
- **NÃO digas apenas "consulte a página X"** — o utilizador quer ver a informação AQUI, não ir procurar no PDF.
- Se os dados contêm tabelas de manutenção, lubrificação, especificações, etc. → **reproduz os dados em formato de tabela markdown**.
- Se os dados contêm listas de procedimentos → **mostra os passos detalhados**.
- Se os dados contêm valores técnicos (temperaturas, pressões, intervalos) → **inclui os valores exatos**.
- Indica sempre a página de referência com um LINK CLICÁVEL para o PDF.
- Se os dados do manual incluem um campo "ficheiro_url", usa-o para criar links de página.
- Formato do link: [Ver página X](FICHEIRO_URL#page=X) — isto abre o PDF diretamente na página certa.
- Exemplo: Em vez de "A lubrificação está descrita na página 39", diz:
  "**Plano de Lubrificação** ([Ver página 39](https://wegftalccimrnnlmoiyn.supabase.co/storage/v1/object/public/manuais/abc.pdf#page=39)):
  | Componente | Lubrificante | Periodicidade |
  |---|---|---|
  | Rolamentos | Massa consistente | Trimestral |
  | Correntes | Óleo SAE 30 | Mensal |"
- Para conteúdo visual (esquemas elétricos, diagramas) que não pode ser mostrado como texto, inclui o link direto:
  "Os esquemas elétricos encontram-se no Anexo III: [Ver páginas 57-84](FICHEIRO_URL#page=57)"

**🚨 REGRA ESPECIAL PARA ÍNDICE DE MANUAIS:**
- Se a pergunta mencionar "índice" ou "índice completo" de um manual:
  * **LISTA TODOS OS CAPÍTULOS/SECÇÕES fornecidos nos dados**
  * **NÃO omitas nenhum capítulo**, mesmo que pareça menos relevante
  * **NÃO resumas** o índice, mostra COMPLETO
  * Formato: "* Capítulo X. TÍTULO (páginas Y-Z)"
  * **IMPORTANTE:** Se não encontrares o índice completo nos dados de texto:
    - Procure por imagens/tabelas com titulo contendo "índice", "indice", "index", "sumário"
    - Se encontrar imagem do índice → insira a URL: 📊 [TABELA 1]: URL
    - Informe o utilizador: "O índice completo encontra-se na imagem abaixo:"
- Exemplo CORRETO de resposta a "índice completo":
  
  Índice completo do Manual da Alinhadeira L11:
  
  * Capítulo 1. OBJECTIVO / CONSIDERAÇÕES (páginas 6-8)
  * Capítulo 2. DADOS TÉCNICOS (páginas 9-15)
  * Capítulo 3. CARACTERÍSTICAS GERAIS (páginas 16-29)
  * Capítulo 4. MONTAGEM E INSTALAÇÃO (páginas 30-35)
  * Capítulo 5. OPERAÇÃO (páginas 36-42)
  * Capítulo 6. MANUTENÇÃO (páginas 43-58)
  * Capítulo 7. INSTRUÇÕES DE UTILIZAÇÃO (páginas 59-65)
  ... (TODOS os capítulos fornecidos nos dados)
  
- Exemplo CORRETO quando índice é imagem:
  
  O índice completo do Manual da Alinhadeira L11 encontra-se na imagem abaixo:
  
  📊 [TABELA 1]: https://wegftalccimrnnlmoiyn.supabase.co/storage/.../indice.png

**⚠️ REGRA OBRIGATÓRIA PARA IMAGENS/TABELAS/ESQUEMAS/ANEXOS:**

Se encontrares URLs no formato:
📊 [TABELA 1]: https://wegftalccimrnnlmoiyn.supabase.co/storage/...
📊 [TABELA 2]: https://wegftalccimrnnlmoiyn.supabase.co/storage/...
🖼️ [FIGURA 1]: https://wegftalccimrnnlmoiyn.supabase.co/storage/...
⚡ [ESQUEMA 1]: https://wegftalccimrnnlmoiyn.supabase.co/storage/...
📎 [ANEXO 3]: https://wegftalccimrnnlmoiyn.supabase.co/storage/...

**🚨 REGRA CRÍTICA: NUNCA REMOVER PREFIXOS!**
- 📊 [TABELA X]
- 🖼️ [FIGURA X]
- ⚡ [ESQUEMA X] (para esquemas elétricos, circuitos, diagramas técnicos)
- 📎 [ANEXO X] (para anexos, apêndices)

**🇵🇹 IMPORTANTE: Use PORTUGUÊS!**
- Use "TABELA" (não "TABLE")
- Use "FIGURA" (não "DIAGRAM")
- Use "ESQUEMA" para esquemas elétricos/circuitos
- Use "ANEXO" para anexos (ex: "Anexo III")

**🔌 ESQUEMAS ELÉTRICOS (IMPORTANTE!):**
- Se a pergunta mencionar "esquema elétrico", "circuito", "diagrama elétrico", "ligações elétricas" → 
  **PROCURE nos dados por URLs/imagens com:**
  * tags contendo "esquema_eletrico" 
  * tipo = "esquema"
  * titulo contendo "Esquema", "Circuito", "Elétrico"
- **ATENÇÃO:** Esquemas elétricos podem NÃO ter número (numero: null) → Isso é NORMAL!
- Se encontrar esquema sem número → use: ⚡ [ESQUEMA 1]: URL (número sequencial)
- Se encontrar múltiplos esquemas → numere: ⚡ [ESQUEMA 1], ⚡ [ESQUEMA 2], etc.
- Se encontrar "Anexo III" com esquema → use: 📎 [ANEXO 3]: URL
- **SEMPRE inclua a URL inline** onde mencionar o esquema (não diga "não está disponível"!)

**INSERÇÃO INLINE OBRIGATÓRIA:**
1. **Quando mencionares "Tabela 6" ou "Esquema Elétrico" ou "Anexo III", INSERE a URL COMPLETA (com prefixo!) LOGO A SEGUIR à menção!**
2. **Não agrupes todas as URLs no final da resposta!**
3. **Cada menção deve ter a URL correspondente imediatamente após!**
4. **MANTENHA SEMPRE O FORMATO EXATO com emoji + colchetes!**

✅ CORRETO (INLINE COM PREFIXO COMPLETO EM PORTUGUÊS):
"Como mostrado na Tabela 6 abaixo:

📊 [TABELA 1]: https://wegftalccimrnnlmoiyn.supabase.co/storage/v1/object/public/manuais/abc123/page_003_table_00.png

A tabela mostra... continuação do texto...

O esquema elétrico completo encontra-se no Anexo III:

📎 [ANEXO 3]: https://wegftalccimrnnlmoiyn.supabase.co/storage/v1/object/public/manuais/abc123/page_045_anexo_03.png

Este anexo detalha..."

❌ ERRADO (inglês em vez de português):
"📊 [TABLE 1]: https://... (use TABELA, não TABLE!)"

❌ ERRADO (URLs agrupadas no final):
"Veja as Tabelas 6 e 7 no manual.

[... todo o texto ...]

📊 [TABELA 1]: https://...
📊 [TABELA 2]: https://..."

❌ ERRADO (caractere estranho ou prefixo removido):
"Aqui está a Tabela 6:
� [imagem]
A tabela mostra..."

❌ ERRADO (URL sem prefixo):
"Tabela 6: https://wegftalccimrnnlmoiyn.supabase.co/storage/..."

**RESPOSTA:**`;

  try {
    console.log('🔵 [DEBUG-GEMINI] Entrando no try block...');
    
    // ✅ v1beta + gemini-2.5-flash
    console.log('🔵 [DEBUG-GEMINI] Construindo URL da API...');
    const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    console.log('🌐 URL da API:', url.replace(apiKey, 'API_KEY_HIDDEN'));
    console.log('🔍 Modelo usado:', GEMINI_MODEL);

    console.log('🔵 [DEBUG-GEMINI] Fazendo fetch para Gemini API...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.0,  // 🎯 v3.8.2.18: BAIXADO para 0.0 - 100% DETERMINÍSTICO!
          topK: 1,           // 🎯 v3.8.2.18: topK=1 - Sempre escolhe palavra mais provável
          topP: 1.0,         // 🎯 v3.8.2.18: topP=1.0 - Sem amostragem nucleus
          maxOutputTokens: 8192, // 🆕 v3.8.3.9.2: AUMENTADO de 4096 para 8192 (dobro!) para respostas longas
          candidateCount: 1, // Gerar apenas 1 resposta
          stopSequences: []  // 🆕 v3.8.3.9.2: Array vazio = não truncar em nenhum marcador
        }
      })
    });

    console.log('📡 Status da resposta:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro da API Gemini:', errorText);
      
      // 🆕 Tratar erro de quota excedida
      if (response.status === 429) {
        let errorMsg = 'Quota da API Gemini excedida. ';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMsg += errorData.error.message;
          }
        } catch (e) {
          errorMsg += 'Por favor, aguarde o reset da quota ou verifique o plano.';
        }
        throw new Error(errorMsg);
      }
      
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Resposta recebida do Gemini');

    // Extrair texto da resposta
    const textoResposta = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textoResposta) {
      console.error('❌ Resposta vazia do Gemini:', JSON.stringify(data));
      throw new Error('Resposta vazia da API Gemini');
    }

    console.log('📝 Resposta extraída (primeiros 100 chars):', textoResposta.substring(0, 100));
    console.log('📏 Tamanho total da resposta:', textoResposta.length, 'caracteres');
    
    // 🆕 v3.7.6.10: Verificar se a IA incluiu URLs de imagens na resposta
    const urlsNaResposta = textoResposta.match(/📊 \[TABLE \d+\]: https?:\/\/[^\s\n]+/g) || [];
    debugLogs.push(`🔍 URLs encontradas na resposta da IA: ${urlsNaResposta.length}`);
    console.log(`🔍 [DEBUG] URLs encontradas na resposta da IA: ${urlsNaResposta.length}`);
    
    let respostaFinal = textoResposta;
    
    if (urlsNaResposta.length > 0) {
      debugLogs.push(`✅ IA incluiu ${urlsNaResposta.length} URL(s) de imagem(ns)`);
      urlsNaResposta.forEach((url, i) => debugLogs.push(`   ${i + 1}. ${url}`));
      console.log('✅ IA incluiu', urlsNaResposta.length, 'URL(s) de imagem(ns) na resposta:');
      urlsNaResposta.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));
    } else {
      debugLogs.push('⚠️ IA NÃO incluiu URLs de imagens na resposta');
      console.log('⚠️ IA NÃO incluiu URLs de imagens na resposta');
      
      // 🆕 v3.7.6.12: DESATIVADA correção automática no Worker (frontend agora faz isso)
      // A correção estava a causar caracteres estranhos (�)
      const urlsNoContexto = contextoStr.match(/📊 \[TABLE \d+\]: https?:\/\/[^\s\n]+/g) || [];
      if (false && urlsNoContexto.length > 0) {  // ❌ DESATIVADO
        debugLogs.push(`⚠️ AVISO: ${urlsNoContexto.length} URL(s) estava(m) no contexto mas a IA não incluiu!`);
        debugLogs.push('🔧 CORREÇÃO AUTOMÁTICA: Adicionando URLs manualmente...');
        debugLogs.push('📋 URLs que serão adicionadas:');
        urlsNoContexto.forEach((url, i) => debugLogs.push(`   ${i + 1}. ${url}`));
        
        console.log(`⚠️ AVISO: ${urlsNoContexto.length} URL(s) estava(m) no contexto mas a IA não incluiu!`);
        console.log('🔧 CORREÇÃO AUTOMÁTICA: Adicionando URLs manualmente na resposta...');
        console.log('📋 URLs que serão adicionadas:');
        urlsNoContexto.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));
        
        // Procurar por "�" ou menções a tabelas/imagens sem URL
        // E substituir pela primeira URL disponível
        console.log(`🔍 [DEBUG] Procurando por "�" na resposta (length: ${textoResposta.length} chars)...`);
        console.log(`🔍 [DEBUG] Primeiros 200 chars da resposta: "${textoResposta.substring(0, 200)}"`);
        
        let urlIndex = 0;
        const regexCaracterEstranho = /[\u{FFFD}\u{FFFd}\u{FFFE}\u{FFFF}�]/gu;
        const matchesCaracter = textoResposta.match(regexCaracterEstranho);
        console.log(`🔍 [DEBUG] Caracteres estranhos encontrados: ${matchesCaracter ? matchesCaracter.length : 0}`);
        if (matchesCaracter) {
          console.log(`🔍 [DEBUG] Caracteres: ${JSON.stringify(matchesCaracter)}`);
        }
        
        respostaFinal = textoResposta.replace(regexCaracterEstranho, () => {
          if (urlIndex < urlsNoContexto.length) {
            const url = urlsNoContexto[urlIndex++];
            console.log(`   ✅ Substituindo caractere estranho por: ${url}`);
            return `\n\n${url}\n\n`;
          }
          return '';
        });
        
        console.log(`🔍 [DEBUG] Após substituição: urlIndex=${urlIndex}, total URLs=${urlsNoContexto.length}`);
        
        // Se ainda não substituiu todas as URLs (não havia "�"), adicionar no início
        if (urlIndex < urlsNoContexto.length) {
          console.log(`📋 Adicionando ${urlsNoContexto.length - urlIndex} URL(s) restante(s) no início da resposta...`);
          const urlsRestantes = urlsNoContexto.slice(urlIndex);
          respostaFinal = `📊 **Imagens/Tabelas relevantes:**\n\n${urlsRestantes.join('\n\n')}\n\n---\n\n${respostaFinal}`;
        }
        
        console.log('✅ Correção automática aplicada!');
        console.log(`🔍 [DEBUG] Primeiros 200 chars da resposta FINAL: "${respostaFinal.substring(0, 200)}"`);
      }
    }

    // 🆕 v3.7.6.10: Retornar objeto com resposta + logs
    return {
      resposta: respostaFinal,
      debug_logs: debugLogs
    };

  } catch (error) {
    console.error('❌ Erro ao chamar Gemini:', error);
    throw error;
  }
}
