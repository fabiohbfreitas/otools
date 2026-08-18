# Instalando extensão
A instalação e uso da extensão deve ocorrer no navegador Google Chrome
Deve ser feito somente uma vez (ou quando houver atualização)
1. Faça o download do zip da extensão e extraia a pasta extensao

2. Abra o Google Chrome e acesse chrome://extensions/.

3. Ative o Modo do desenvolvedor no canto superior direito.

4. Clique em "Carregar sem compactação" e escolha a pasta extraida

5. A extensão deve aparecer como instalada e ativa

# Obtendo a planilha do SISREGIII
1. Abra o SISREGIII na agenda desejada com as opções:

    Tipo de agenda: consulta
    
    [x] Exibir procedimentos [x] Exibir Telefones [x] Listar para impressão

2. Abra a extensão apertando o botão das extensões próximo a barra de endereços

3. Configure os parâmatros desejados:

    A extensão tentará colocar os parâmetros corretos mas é sempre importante validar os dados: Data da consulta, Especialidade, Local, Horários disponíveis (Ex. 07,08,09,10,11,12,13)

4. Clique em Excel na opção "Dados para Importação"

5. Importe os dados no Fasterisk e continue o processo

# Importação da planilha de contatos
Fasterisk: CRM -> Contatos

1. Importar Contatoss
2. Formato: Arquivo do excel -> Próximo
3. Mapeamento: Próximo
4. Conflitos: 
    Em alguns casos contatos podem ter o mesmo telefone, nesse caso é preciso escolher qual contato que possui o número em Conflito

    Após resolver possíveis conflitos: Próximo
5. Importar

Documentação do Fasterisk (Importação): https://docs.flw.chat/guide/documentacao/crm/contato/importacao-de-contatos

# Envio de mensagens via Fasterisk Campanhas
Para cada horário desejado será criada uma campanha nova.
Ex. Ortopedia Gama nos horários 07h, 08h, 09h, 10h, 11h, 12h, 13h

Devem ser criadas as campanhas: 
- [Gama] [Ortopedia] Consulta 07h 24/07/2026
- [Gama] [Ortopedia] Consulta 08h 24/07/2026
- [Gama] [Ortopedia] Consulta 09h 24/07/2026
- [Gama] [Ortopedia] Consulta 10h 24/07/2026
- [Gama] [Ortopedia] Consulta 11h 24/07/2026
- [Gama] [Ortopedia] Consulta 12h 24/07/2026
- [Gama] [Ortopedia] Consulta 13h 24/07/2026

A mesma lógica deve ser aplicada a todos os locais, especialidades e horários distintos disponíveis conforme a disponiblidade oferecida.

Abra o Fasterisk: Apps -> Campanhas -> Nova

Configurações da Campanha
1. Nome da campanha: [Local] [Especialidade] Consulta XXh dd/mm/yyyy 
(Ex. `[Gama] [Ortopedia] Consulta 07h 24/07/2026`)

2. Para qual equipe serão direcionadas as respostas dos contatos: Geral

3. Qual canal será utilizado para o disparo da campanha: Padrão (Não fazer mudanças)

4. Se terá um chatbot habilitado ou não: Desabilitar Chatbot (Opção Padrão)

5. Quando será feito o envio: Envio Imediato
    Também é possível agendar envios para datas/horários futuros

6. Configurações de Disparo:

    6.1 Conversas em andamento -> "Não disparar para este contato"

    6.2 Manter as outras opções

7. Definir o público: 

    7.1 Filtro por contato

    7.2 Adicionar etiqueta -> Adicionar as 5 etiquetas: <Data da consulta>, Automação, <Especialidade>, <Local>, <Horario> 
        Ex. `2026-07-24, Automação, Gama, Ortopedia, Consulta07h`

    7.3 Aplicar Filtros

    7.4 Adicionar XX Contatos (Ex. Adicionar 15 Contatos)

8. Disparo -> Modelo De Mensagem

    8.1 Alterar

    8.2 Mudar menu Campanha -> Sequência

    8.3 Escolher mensagem para fazer envio `Ex. [Automação] Mensagem de Confirmação de Consultas (com Botões)`

    8.4 Definir os Parâmetros da mensagem: Depende da mensagem a ser enviada
        Ex. Especialidade -> Ortopedia, Data -> 24/07/2026, Horário: 07:00, Local -> Centro de Imagens do Gama..., Linkmaps -> https://maps.google.com
        
    7.5 Salvar

9. Confirmar e Disparar

Documentação do Fasterisk (Campanhas): https://docs.flw.chat/guide/documentacao/apps/campanha/criar-nova-campanha