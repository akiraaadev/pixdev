import express, { Request, Response } from 'express';
import path from 'path';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { generatePixPayload, validatePixKey, maskPixKey } from './src/utils/pixPayload.ts';

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// In-memory data store with initial seed for quick demo and testing
interface EstablishmentRecord {
  id: string;
  user_id: string;
  name: string;
  owner_name: string;
  document: string;
  document_type: 'cpf' | 'cnpj';
  phone: string;
  whatsapp: string;
  email: string;
  logo_url: string;
  primary_pix_key_id?: string;
  city: string;
  address: string;
  slug: string;
  primary_color: string;
  secondary_color: string;
  background_image_url?: string;
  welcome_message?: string;
  created_at: string;
  updated_at: string;
}

interface PixKeyRecord {
  id: string;
  establishment_id: string;
  key_type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  key_value: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

interface PaymentLinkRecord {
  id: string;
  establishment_id: string;
  pix_key_id: string;
  slug: string;
  title: string;
  description?: string;
  amount: number | null;
  is_active: boolean;
  visits_count: number;
  txid?: string;
  created_at: string;
  updated_at: string;
}

interface NFCTagRecord {
  id: string;
  tag_code: string;
  establishment_id: string;
  payment_link_id: string;
  label: string;
  status: 'active' | 'inactive';
  taps_count: number;
  last_tap_at?: string;
  created_at: string;
  updated_at: string;
}

interface PageVisitRecord {
  id: string;
  establishment_id: string;
  payment_link_id?: string;
  nfc_tag_id?: string;
  source: 'direct_link' | 'nfc_tap' | 'qr_scan';
  timestamp: string;
  date_str: string;
}

// Seed Store
const establishments: EstablishmentRecord[] = [
  {
    id: 'est-1',
    user_id: 'user-demo',
    name: 'Farmácia do Carro',
    owner_name: 'Carlos Alberto Silva',
    document: '12.345.678/0001-90',
    document_type: 'cnpj',
    phone: '(11) 98765-4321',
    whatsapp: '(11) 98765-4321',
    email: 'contato@farmaciadocarro.com.br',
    logo_url: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=150&auto=format&fit=crop&q=80',
    primary_pix_key_id: 'key-1',
    city: 'SAO PAULO',
    address: 'Av. Paulista, 1500 - Bela Vista',
    slug: 'farmacia-do-carro',
    primary_color: '#00B8A9',
    secondary_color: '#7137E8',
    background_image_url: '',
    welcome_message: 'Pague seu medicamento ou delivery com Pix na hora!',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'est-2',
    user_id: 'user-demo',
    name: 'Barbearia Premium',
    owner_name: 'Felipe Santos',
    document: '98.765.432/0001-11',
    document_type: 'cnpj',
    phone: '(11) 97123-4567',
    whatsapp: '(11) 97123-4567',
    email: 'atendimento@barbeariapremium.com.br',
    logo_url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=150&auto=format&fit=crop&q=80',
    primary_pix_key_id: 'key-2',
    city: 'CAMPINAS',
    address: 'Rua das Camélias, 420 - Cambuí',
    slug: 'barbearia-premium',
    primary_color: '#7137E8',
    secondary_color: '#00B8A9',
    welcome_message: 'Corte, barba e estilo. Aproxime e pague via Pix.',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'est-3',
    user_id: 'user-demo',
    name: 'Mercado Central',
    owner_name: 'Mariana Duarte',
    document: '33.444.555/0001-66',
    document_type: 'cnpj',
    phone: '(21) 99887-6655',
    whatsapp: '(21) 99887-6655',
    email: 'financeiro@mercadocentral.com',
    logo_url: '',
    primary_pix_key_id: 'key-3',
    city: 'RIO DE JANEIRO',
    address: 'Praça XV de Novembro, 88 - Centro',
    slug: 'mercado-central',
    primary_color: '#00B8A9',
    secondary_color: '#182235',
    welcome_message: 'Caixa Rápido Meu Pix NFC - Economize tempo.',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

const pixKeys: PixKeyRecord[] = [
  {
    id: 'key-1',
    establishment_id: 'est-1',
    key_type: 'cnpj',
    key_value: '12345678000190',
    label: 'CNPJ Principal - Santander',
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'key-2',
    establishment_id: 'est-2',
    key_type: 'phone',
    key_value: '+5511971234567',
    label: 'Celular - NuBank PJ',
    is_active: true,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString()
  },
  {
    id: 'key-3',
    establishment_id: 'est-3',
    key_type: 'email',
    key_value: 'pix@mercadocentral.com',
    label: 'E-mail Financeiro - Itaú',
    is_active: true,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString()
  }
];

const paymentLinks: PaymentLinkRecord[] = [
  {
    id: 'link-1',
    establishment_id: 'est-1',
    pix_key_id: 'key-1',
    slug: 'farmacia-do-carro',
    title: 'Balcão Principal - Farmácia do Carro',
    description: 'Pague qualquer valor diretamente no caixa',
    amount: null, // valor livre
    is_active: true,
    visits_count: 247,
    txid: 'FARMA01',
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'link-2',
    establishment_id: 'est-2',
    pix_key_id: 'key-2',
    slug: 'barbearia-premium',
    title: 'Corte Tradicional + Barba',
    description: 'Combo cabelo e barba completo',
    amount: 85.00,
    is_active: true,
    visits_count: 142,
    txid: 'BARBER85',
    created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'link-3',
    establishment_id: 'est-3',
    pix_key_id: 'key-3',
    slug: 'mercado-central',
    title: 'Caixa Expresso Hortifruti',
    description: 'Pagamento rápido sem filas',
    amount: null,
    is_active: true,
    visits_count: 512,
    txid: 'MCENTRAL',
    created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

const nfcTags: NFCTagRecord[] = [
  {
    id: 'nfc-1',
    tag_code: 'NFC-FARMA-01',
    establishment_id: 'est-1',
    payment_link_id: 'link-1',
    label: 'Totem de Entrada / Caixa 1',
    status: 'active',
    taps_count: 184,
    last_tap_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'nfc-2',
    tag_code: 'NFC-BARBER-01',
    establishment_id: 'est-2',
    payment_link_id: 'link-2',
    label: 'Espelho Cadeira 1',
    status: 'active',
    taps_count: 98,
    last_tap_at: new Date(Date.now() - 7200000).toISOString(),
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'nfc-3',
    tag_code: 'NFC-MERCADO-01',
    establishment_id: 'est-3',
    payment_link_id: 'link-3',
    label: 'Plaquinha Balcão Hortifruti',
    status: 'active',
    taps_count: 382,
    last_tap_at: new Date(Date.now() - 1800000).toISOString(),
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Gerar visitas nos últimos 14 dias para gráficos realistas
const pageVisits: PageVisitRecord[] = [];
for (let i = 13; i >= 0; i--) {
  const d = new Date(Date.now() - i * 86400000);
  const dateStr = d.toISOString().split('T')[0];
  const count = Math.floor(25 + Math.random() * 45 + (13 - i) * 3);
  for (let j = 0; j < count; j++) {
    pageVisits.push({
      id: `visit-${i}-${j}`,
      establishment_id: establishments[j % establishments.length].id,
      payment_link_id: paymentLinks[j % paymentLinks.length].id,
      source: j % 2 === 0 ? 'nfc_tap' : 'direct_link',
      timestamp: new Date(d.getTime() + Math.random() * 86400000).toISOString(),
      date_str: dateStr
    });
  }
}

// ==========================================
// API REST - MEU PIX NFC
// ==========================================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'Meu Pix NFC',
    timestamp: new Date().toISOString()
  });
});

// Gera código Pix BR Code e QR Code oficial
app.post('/api/pix/payload', async (req: Request, res: Response) => {
  try {
    const { pixKey, keyType, merchantName, merchantCity, amount, txid, description } = req.body;

    if (!pixKey || !merchantName) {
      return res.status(400).json({ error: 'Chave Pix e Nome do Recebedor são obrigatórios.' });
    }

    if (keyType) {
      const val = validatePixKey(pixKey, keyType);
      if (!val.valid) {
        return res.status(400).json({ error: val.error });
      }
    }

    const payload = generatePixPayload({
      pixKey,
      merchantName,
      merchantCity: merchantCity || 'BRASIL',
      amount: amount ? Number(amount) : null,
      txid: txid || '***',
      description
    });

    const qrCodeDataUrl = await QRCode.toDataURL(payload, {
      width: 480,
      margin: 2,
      color: {
        dark: '#182235',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    res.json({
      payload,
      qrCodeDataUrl,
      maskedKey: maskPixKey(pixKey, keyType || 'random')
    });
  } catch (error: any) {
    console.error('Erro ao gerar BR Code:', error);
    res.status(500).json({ error: error?.message || 'Falha ao gerar payload Pix.' });
  }
});

// Estatísticas da Dashboard
app.get('/api/stats', (_req: Request, res: Response) => {
  const totalEstablishments = establishments.length;
  const totalPixKeys = pixKeys.length;
  const totalLinks = paymentLinks.length;
  const activeLinks = paymentLinks.filter(l => l.is_active).length;
  const totalVisits = pageVisits.length;
  const totalNfcTaps = nfcTags.reduce((acc, t) => acc + t.taps_count, 0);

  // Agrupamento por dia (últimos 7 dias)
  const last7Days: { date: string; visits: number; taps: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const dayVisits = pageVisits.filter(v => v.date_str === dateStr).length;
    const dayTaps = pageVisits.filter(v => v.date_str === dateStr && v.source === 'nfc_tap').length;
    last7Days.push({
      date: dateStr,
      visits: dayVisits,
      taps: dayTaps
    });
  }

  res.json({
    totalEstablishments,
    totalPixKeys,
    totalLinks,
    activeLinks,
    totalVisits,
    totalNfcTaps,
    qrCodesGenerated: totalLinks * 3 + 15,
    dailyChart: last7Days
  });
});

// Estabelecimentos CRUD
app.get('/api/establishments', (_req: Request, res: Response) => {
  res.json(establishments);
});

app.post('/api/establishments', (req: Request, res: Response) => {
  const { name, owner_name, document, document_type, phone, whatsapp, email, logo_url, city, address, slug, primary_color, secondary_color, welcome_message, initial_pix_key, initial_key_type } = req.body;

  if (!name || !owner_name || !document || !city || !slug) {
    return res.status(400).json({ error: 'Preencha os campos obrigatórios.' });
  }

  // Verifica se o slug já existe
  const exists = establishments.some(e => e.slug.toLowerCase() === slug.toLowerCase().trim());
  if (exists) {
    return res.status(409).json({ error: 'Este identificador de link (slug) já está em uso.' });
  }

  const newId = `est-${Date.now()}`;
  const now = new Date().toISOString();

  let createdKeyId: string | undefined = undefined;
  if (initial_pix_key && initial_key_type) {
    const newKeyId = `key-${Date.now()}`;
    pixKeys.push({
      id: newKeyId,
      establishment_id: newId,
      key_type: initial_key_type,
      key_value: initial_pix_key,
      label: 'Chave Principal',
      is_active: true,
      created_at: now
    });
    createdKeyId = newKeyId;
  }

  const newEst: EstablishmentRecord = {
    id: newId,
    user_id: 'user-demo',
    name: name.trim(),
    owner_name: owner_name.trim(),
    document: document.trim(),
    document_type: document_type || 'cnpj',
    phone: phone.trim(),
    whatsapp: whatsapp || phone.trim(),
    email: email.trim(),
    logo_url: logo_url || '',
    primary_pix_key_id: createdKeyId,
    city: city.trim().toUpperCase(),
    address: address || '',
    slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    primary_color: primary_color || '#00B8A9',
    secondary_color: secondary_color || '#7137E8',
    welcome_message: welcome_message || 'Aproxime e pague rapidamente via Pix',
    created_at: now,
    updated_at: now
  };

  establishments.unshift(newEst);

  // Cria um link padrão correspondente
  if (createdKeyId) {
    paymentLinks.unshift({
      id: `link-${Date.now()}`,
      establishment_id: newId,
      pix_key_id: createdKeyId,
      slug: newEst.slug,
      title: `Pagamento Pix — ${newEst.name}`,
      description: 'Aproxime sua plaquinha NFC ou escaneie o QR Code',
      amount: null,
      is_active: true,
      visits_count: 0,
      txid: '***',
      created_at: now,
      updated_at: now
    });
  }

  res.status(201).json(newEst);
});

app.put('/api/establishments/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = establishments.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
  }

  const update = req.body;
  if (update.slug && update.slug !== establishments[index].slug) {
    const slugExists = establishments.some(e => e.id !== id && e.slug === update.slug);
    if (slugExists) {
      return res.status(409).json({ error: 'Slug já em uso por outro estabelecimento.' });
    }
  }

  establishments[index] = {
    ...establishments[index],
    ...update,
    updated_at: new Date().toISOString()
  };

  res.json(establishments[index]);
});

app.delete('/api/establishments/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = establishments.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
  }

  establishments.splice(index, 1);
  res.json({ success: true, message: 'Estabelecimento removido com sucesso.' });
});

// Chaves Pix CRUD
app.get('/api/pix-keys', (req: Request, res: Response) => {
  const { establishment_id } = req.query;
  if (establishment_id) {
    return res.json(pixKeys.filter(k => k.establishment_id === establishment_id));
  }
  res.json(pixKeys);
});

app.post('/api/pix-keys', (req: Request, res: Response) => {
  const { establishment_id, key_type, key_value, label } = req.body;
  if (!establishment_id || !key_type || !key_value) {
    return res.status(400).json({ error: 'Dados incompletos para chave Pix.' });
  }

  const validation = validatePixKey(key_value, key_type);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const newKey: PixKeyRecord = {
    id: `key-${Date.now()}`,
    establishment_id,
    key_type,
    key_value: key_value.trim(),
    label: label?.trim() || 'Chave Pix',
    is_active: true,
    created_at: new Date().toISOString()
  };

  pixKeys.unshift(newKey);
  res.status(201).json(newKey);
});

app.put('/api/pix-keys/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = pixKeys.findIndex(k => k.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Chave não encontrada.' });
  }

  pixKeys[index] = {
    ...pixKeys[index],
    ...req.body
  };
  res.json(pixKeys[index]);
});

app.delete('/api/pix-keys/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = pixKeys.findIndex(k => k.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Chave não encontrada.' });
  }

  // Verifica se há links de pagamento dependendo desta chave
  const inUse = paymentLinks.some(l => l.pix_key_id === id && l.is_active);
  if (inUse) {
    return res.status(400).json({ error: 'Esta chave está associada a um link de pagamento ativo. Desative ou altere o link antes.' });
  }

  pixKeys.splice(index, 1);
  res.json({ success: true });
});

// Links de Pagamento CRUD
app.get('/api/payment-links', (req: Request, res: Response) => {
  const { establishment_id } = req.query;
  if (establishment_id) {
    return res.json(paymentLinks.filter(l => l.establishment_id === establishment_id));
  }
  res.json(paymentLinks);
});

app.post('/api/payment-links', (req: Request, res: Response) => {
  const { establishment_id, pix_key_id, slug, title, description, amount, txid } = req.body;
  if (!establishment_id || !pix_key_id || !slug || !title) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
  const exists = paymentLinks.some(l => l.slug === cleanSlug);
  if (exists) {
    return res.status(409).json({ error: 'Este link já está cadastrado.' });
  }

  const newLink: PaymentLinkRecord = {
    id: `link-${Date.now()}`,
    establishment_id,
    pix_key_id,
    slug: cleanSlug,
    title: title.trim(),
    description: description || '',
    amount: amount ? Number(amount) : null,
    is_active: true,
    visits_count: 0,
    txid: txid || '***',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  paymentLinks.unshift(newLink);
  res.status(201).json(newLink);
});

app.put('/api/payment-links/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = paymentLinks.findIndex(l => l.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Link não encontrado.' });
  }

  paymentLinks[index] = {
    ...paymentLinks[index],
    ...req.body,
    updated_at: new Date().toISOString()
  };
  res.json(paymentLinks[index]);
});

app.delete('/api/payment-links/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = paymentLinks.findIndex(l => l.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Link não encontrado.' });
  }
  paymentLinks.splice(index, 1);
  res.json({ success: true });
});

// Plaquinhas NFC CRUD
app.get('/api/nfc-tags', (_req: Request, res: Response) => {
  res.json(nfcTags);
});

app.post('/api/nfc-tags', (req: Request, res: Response) => {
  const { tag_code, establishment_id, payment_link_id, label } = req.body;
  if (!tag_code || !establishment_id || !payment_link_id) {
    return res.status(400).json({ error: 'Identificador físico da plaquinha e destino são obrigatórios.' });
  }

  const cleanCode = tag_code.trim().toUpperCase();
  const exists = nfcTags.some(t => t.tag_code === cleanCode);
  if (exists) {
    return res.status(409).json({ error: 'Já existe uma plaquinha com este identificador.' });
  }

  const newTag: NFCTagRecord = {
    id: `nfc-${Date.now()}`,
    tag_code: cleanCode,
    establishment_id,
    payment_link_id,
    label: label?.trim() || `Plaquinha ${cleanCode}`,
    status: 'active',
    taps_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  nfcTags.unshift(newTag);
  res.status(201).json(newTag);
});

app.put('/api/nfc-tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = nfcTags.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Plaquinha NFC não encontrada.' });
  }

  nfcTags[index] = {
    ...nfcTags[index],
    ...req.body,
    updated_at: new Date().toISOString()
  };
  res.json(nfcTags[index]);
});

app.delete('/api/nfc-tags/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = nfcTags.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Plaquinha não encontrada.' });
  }
  nfcTags.splice(index, 1);
  res.json({ success: true });
});

// PÁGINA PÚBLICA DE PAGAMENTO — Busca estabelecimento, link e gera BR Code sob demanda
app.get('/api/public/payment/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const cleanSlug = slug.toLowerCase().trim();

    // Procura por link ou por estabelecimento com o slug
    let link = paymentLinks.find(l => l.slug === cleanSlug && l.is_active);
    let est: EstablishmentRecord | undefined;

    if (link) {
      est = establishments.find(e => e.id === link!.establishment_id);
    } else {
      est = establishments.find(e => e.slug === cleanSlug);
      if (est) {
        link = paymentLinks.find(l => l.establishment_id === est!.id && l.is_active);
      }
    }

    if (!est) {
      return res.status(404).json({ error: 'Página de pagamento não encontrada ou desativada.' });
    }

    // Busca chave Pix associada
    const keyId = link?.pix_key_id || est.primary_pix_key_id;
    const pixKey = pixKeys.find(k => k.id === keyId && k.is_active);

    if (!pixKey) {
      return res.status(400).json({ error: 'Nenhuma chave Pix ativa configurada para este estabelecimento.' });
    }

    // Incrementa contagem de visitas
    if (link) {
      link.visits_count += 1;
    }
    const today = new Date().toISOString().split('T')[0];
    pageVisits.push({
      id: `visit-${Date.now()}`,
      establishment_id: est.id,
      payment_link_id: link?.id,
      source: (req.query.source as any) || 'direct_link',
      timestamp: new Date().toISOString(),
      date_str: today
    });

    // Gera o BR Code oficial
    const payload = generatePixPayload({
      pixKey: pixKey.key_value,
      merchantName: est.name,
      merchantCity: est.city || 'BRASIL',
      amount: link?.amount ?? null,
      txid: link?.txid || '***',
      description: link?.description || est.welcome_message
    });

    const qrCodeDataUrl = await QRCode.toDataURL(payload, {
      width: 480,
      margin: 2,
      color: {
        dark: '#182235',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    res.json({
      establishment: {
        id: est.id,
        name: est.name,
        owner_name: est.owner_name,
        city: est.city,
        logo_url: est.logo_url,
        primary_color: est.primary_color || '#00B8A9',
        secondary_color: est.secondary_color || '#7137E8',
        background_image_url: est.background_image_url,
        welcome_message: est.welcome_message,
        document_type: est.document_type
      },
      link: link ? {
        id: link.id,
        title: link.title,
        description: link.description,
        amount: link.amount
      } : null,
      pix: {
        masked_key: maskPixKey(pixKey.key_value, pixKey.key_type),
        key_type: pixKey.key_type,
        payload,
        qrCodeDataUrl
      }
    });
  } catch (err: any) {
    console.error('Erro ao resolver link público:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do pagamento.' });
  }
});

// RESOLVEDOR DE PLAQUINHA NFC — Redireciona para o link de pagamento configurado
app.get('/api/public/nfc/:tagCode', (req: Request, res: Response) => {
  const { tagCode } = req.params;
  const tag = nfcTags.find(t => t.tag_code.toUpperCase() === tagCode.toUpperCase() && t.status === 'active');
  if (!tag) {
    return res.status(404).json({ error: 'Plaquinha NFC não cadastrada ou inativa.' });
  }

  // Incrementa toques
  tag.taps_count += 1;
  tag.last_tap_at = new Date().toISOString();

  // Encontra o link
  const link = paymentLinks.find(l => l.id === tag.payment_link_id);
  const est = establishments.find(e => e.id === tag.establishment_id);

  const destinationSlug = link?.slug || est?.slug;

  res.json({
    tag_code: tag.tag_code,
    destination_slug: destinationSlug,
    establishment_name: est?.name,
    taps_count: tag.taps_count
  });
});

// VITE INTEGRATION
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[Meu Pix NFC] Servidor iniciado na porta ${PORT}`);
  });
}

startServer();
