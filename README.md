# Twitch Chat Alert

Extensão Chrome (Manifest V3) que avisa quando chegam mensagens no chat da Twitch, com sons, filtros e ativação por canal.

## Instalação

1. Abra `chrome://extensions` e ative o modo de desenvolvedor.
2. Clique em **Carregar sem compactação** e selecione esta pasta.
3. Abra ou recarregue uma live da Twitch.
4. Abra a extensão e ative **Alertas sonoros** e **Ativar canal**. Canais novos começam desligados.

Depois de atualizar o código, clique em **Recarregar** na extensão e recarregue as abas da Twitch.

## Uso

- **Geral:** ativação global, volume e ativação por canal. Aceita nome ou link da Twitch.
- **Som:** quatro sons locais e URLs HTTPS de áudio; use **Testar som** para conferir. Links externos dependem do servidor e das restrições do navegador e da Twitch.
- **Filtros:** usuários ignorados, mensagens próprias e menções. Informe seu usuário para filtrar menções.
- **Intervalo mínimo:** tempo mínimo entre avisos; zero desativa esse limite.
- **Pausa para disparar:** aguarda uma pausa nas mensagens antes do aviso. Chats contínuos podem adiar o som até ocorrer uma pausa.
- As configurações são salvas localmente e os controles ficam desativados fora da Twitch.
- O status por aba aparece como uma bolinha no canto do ícone: verde para canal ativado, vermelha para canal desativado e cinza para alertas desligados.

O navegador pode bloquear áudio automático até você interagir com a página da Twitch. Mensagens já presentes ao conectar ao chat não geram avisos.

## Verificação

Sem dependências ou etapa de build. Com Node.js instalado:

```sh
node --test tests/behavior.test.cjs
node --check shared.js
node --check popup.js
node --check content.js
node --check background.js
```

Teste manual: carregar a extensão, ativar um canal, testar os quatro sons, enviar mensagens com outra conta, verificar filtros e navegar entre lives sem recarregar a página.

## Arquivos

- `shared.js`: padrões, identificação de canais e reprodução de áudio.
- `content.js`: observação do chat e filtros.
- `background.js`: atualização do selo por aba.
- `popup.html`, `popup.css`, `popup.js`: interface e configurações.
- `icons/`: ícone nos tamanhos 16, 32, 48 e 128 px.
