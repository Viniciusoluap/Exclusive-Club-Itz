/**
 * Marcador de build.
 *
 * POR QUE ISSO EXISTE: não havia nenhuma forma de saber, olhando o sistema no ar,
 * QUAL versão do código estava rodando. Isso tornou impossível distinguir "a
 * correção não funciona" de "a correção nem chegou em produção" — e várias
 * rodadas de investigação se perderam nessa dúvida.
 *
 * COMO USAR: incremente BUILD_MARKER a cada mudança relevante que precise ser
 * confirmada em produção. A tela /admin/diagnostico mostra este valor. Se a tela
 * exibir um marcador antigo, o deploy não levou o código novo — não adianta
 * procurar o defeito no código.
 */

/** Identificador da versão do código. Atualize ao publicar algo que precise ser verificado. */
export const BUILD_MARKER = "2026-08-03.3-backup-destravado";

/** Momento em que o processo do servidor subiu (ISO). Revela reinícios/redeploys. */
export const PROCESS_STARTED_AT = new Date().toISOString();
