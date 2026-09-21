# Recaptção de Pacientes — Contexto

App que ajuda a trazer de volta pacientes que faltaram ou estão pendentes a consultas médicas.

## Vocabulário

- **Polo**: unidade de atendimento. Existem 3: Gama, Samambaia, Sobradinho.
- **Especialidade**: Ortopedia (nos 3 polos) ou Cardiologia (só Samambaia e Sobradinho — nunca Gama).
- **Situação do paciente**: Falta ou Pendente. As duas valem igual para recaptção.
- **Apto**: paciente com situação Falta/Pendente que ainda não entrou em nenhuma recaptção.
- **Recaptção (campanha)**: ação de chamar um grupo de pacientes para uma data futura de consulta.
- **Vaga**: lugar disponível num polo para a data da consulta.
- **Cota por horário**: quantos pacientes vão para um horário específico (ex.: 5 para 07:00). Quando vazia, o horário recebe uma parte igual do restante.
- **Envios**: arquivo para a automação de mensagens. **Pacientes**: arquivo com a lista.

## Regras de negócio

1. Cardiologia não existe no Gama, em lugar nenhum (dados, config, criação, seleção).
2. Falta e Pendente são igualmente aptos. Nenhuma tem prioridade.
3. Paciente selecionado uma vez sai da base de aptos para sempre (vale entre campanhas).
4. Telefone principal identifica o paciente: importar o mesmo telefone atualiza, não duplica.
5. Um paciente pode ter de 1 a 4 telefones, separados por espaço. O primeiro é o principal.
6. Soma das cotas por horário nunca passa das vagas do polo.
7. Horário com cota 0 não recebe ninguém. Horário sem cota divide o resto em blocos iguais (último fica com menos).
8. A distribuição é em blocos por ordem de inserção, não alternada.
9. Etiqueta de agenda omite minutos zerados (09:00 vira Agenda09h; 07:30 vira Agenda07h30).
10. Arquivos exportados saem com tudo como texto (data DD/MM/AAAA, hora HH:MM).

## Casos de uso

**Entrar**

- **Dado** a tela de login. **Quando** entra com o usuário e a senha do ambiente. **Então** recebe sessão de 12h; sem ela, tudo (telas e APIs) exige login.

**Importar pacientes**

- **Dado** um ou mais xlsx (um por polo ou um combinado; vale a primeira aba, polo pela coluna Unidade). **Quando** importados. **Então** pacientes novos entram, telefones repetidos atualizam os existentes, linhas sem polo válido são ignoradas e contadas.

**Ver pacientes**

- **Dado** a lista. **Quando** aberta. **Então** mostra só aptos por padrão, 50 por página, com polo, especialidade, situação e campanha (ou "Apto").

**Configurar padrão**

- **Dado** vagas, horários, endereço e link do mapa por polo/especialidade. **Quando** salvos. **Então** viram ponto de partida ao criar recaptções.

**Criar recaptção**

- **Dado** data futura, especialidade e polos com vagas e horários (cotas opcionais). **Quando** criada. **Então** pacientes aptos são selecionados na hora, por ordem de inserção até as vagas, excluindo quem já está em outra recaptção.

**Completar vagas restantes**

- **Dado** campanha com vagas não preenchidas (ex.: chegou lote novo). **Quando** clica Selecionar. **Então** busca só o que falta, sem repetir ninguém.

**Exportar envios**

- **Dado** campanha com selecionados. **Quando** exporta. **Então** sai xlsx com nome, telefone, outros telefones, etiqueta, data, hora, especialidade, endereço e mapa por paciente.

**Exportar pacientes**

- **Dado** campanha com selecionados. **Quando** exporta. **Então** sai xlsx com os mesmos dados da tela (nome, telefones, data, hora atribuída, especialidade, local).

**Detalhar recaptção**

- **Dado** campanha aberta. **Então** mostra totais, lista de pacientes por polo (igual à exportação) e resumo compacto por horário no final.
