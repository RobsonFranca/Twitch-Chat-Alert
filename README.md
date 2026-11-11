# Twitch Chat Alert

Extensão do Chrome para tocar um aviso sonoro quando chega uma nova mensagem no chat da Twitch.

## Como instalar

1. Abra o Chrome e acesse `chrome://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em "Carregar sem compactação".
4. Selecione a pasta deste projeto.
5. Acesse uma stream da Twitch e o alerta começará a funcionar.

## Como usar

- Abra o popup da extensão para ativar ou desativar o som.
- Ajuste o volume do aviso.
- Use "Testar som" para verificar o alerta.

## Arquivos principais

- `manifest.json`: configuração da extensão
- `content.js`: escuta o chat da Twitch e dispara o som
- `popup.html`: interface do popup
- `popup.js`: controla ativação, volume e teste do som

## Observação

Essa versão usa um tom gerado em JavaScript para evitar dependência de arquivos de áudio externos.
