# Meu Pix NFC — Plataforma SaaS de Pagamentos Pix para Plaquinhas NFC

**Meu Pix NFC** é uma plataforma SaaS profissional completa para geração de links de pagamento Pix, QR Codes BR Code oficiais e páginas customizadas para estabelecimentos comerciais com foco em plaquinhas NFC físicas.

Quando alguém aproxima o celular da plaquinha NFC no balcão da loja, o smartphone abre instantaneamente a página de pagamento personalizada do estabelecimento.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide React, Motion.
- **Backend:** Node.js + Express, TypeScript (tsx).
- **Pix BR Code Engine:** Gerador próprio compatível com o padrão EMVCo e as resoluções do Banco Central do Brasil com cálculo de **CRC16-CCITT**.
- **QR Code:** Biblioteca oficial com renderização em tempo real e download de imagem PNG.
- **Banco de Dados & Autenticação:** Firebase Cloud Firestore e Firebase Authentication com regras de segurança ativas (`firestore.rules`) e blueprint de entidades (`firebase-blueprint.json`).

---

## 🔥 Banco de Dados Firebase Firestore

O projeto está totalmente configurado e provisionado com o Firebase:

- **Configuração:** Gerada em `firebase-applet-config.json`.
- **Coleções do Firestore:**
  - `profiles`: Perfis dos usuários autenticados.
  - `establishments`: Lojas e comércios com customizações visuais.
  - `pix_keys`: Chaves Pix com validação de formato e mascaramento.
  - `payment_links`: Links de pagamento (`/p/:slug`).
  - `nfc_tags`: Plaquinhas físicas com identificador e redirecionamento dinâmico.
  - `page_visits`: Registro de métricas e toques NFC.
- **Segurança:** Regras de segurança em tempo real implantadas via `firestore.rules`.
- **Autenticação:** Suporte a Google Auth via Firebase Authentication.
   - `profiles`
   - `establishments`
   - `pix_keys`
   - `payment_links`
   - `nfc_tags`
   - `page_visits`
   - `plans`
   - `subscriptions`
   - Índices, triggers automáticos para novos usuários e políticas de segurança **Row Level Security (RLS)**.

---

## 📱 Como Gravar Fisicamente as Plaquinhas NFC

1. Compre tags ou plaquinhas acrílicas com chips padrão **NTAG213**, **NTAG215** ou **NTAG216**.
2. Baixe o aplicativo gratuito **NFC Tools** (disponível para Android e iOS).
3. No painel do **Meu Pix NFC**, acesse a aba **Plaquinhas NFC** e clique em **Copiar URL**.
   - O link gerado tem o formato: `https://seusite.com/nfc/NFC-FARMA-01`
4. No app NFC Tools:
   - Toque em **Escrever** > **Adicionar um registro** > **URL / URI**.
   - Cole o link permanente copiado.
   - Toque em **Escrever** e encoste a plaquinha física na traseira do celular.
5. **Redirecionamento Dinâmico:** A tag física nunca precisa ser regravada! Se o comerciante mudar a chave Pix ou criar uma nova promoção, basta alterar o link de destino no painel Meu Pix NFC.

---

## ☁️ Como Fazer Deploy

### Frontend na Vercel
1. Conecte seu repositório no dashboard da Vercel.
2. Defina o Framework Preset como **Vite**.
3. Adicione as variáveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.).
4. Clique em **Deploy**.

### Backend em Node.js (Render / Railway / Cloud Run / VPS)
1. Certifique-se de definir a variável `PORT=3000` (ou a porta atribuída pela hospedagem).
2. Comando de inicialização:
```bash
npm run start
```
ou
```bash
node server.ts
```

---

## ⚖️ Conformidade e Limitações do Pix Estático

- O sistema utiliza **Pix Estático** (BR Code oficial do BCB).
- Os pagamentos caem **100% diretamente na conta bancária do estabelecimento** cadastrado, sem intermediação financeira ou retenção de saldo.
- Conforme as regras do Banco Central, o acesso à página ou o escaneamento do QR Code **não comprova o pagamento** até que o pagador conclua a transferência no app bancário e o lojista confira o comprovante.
