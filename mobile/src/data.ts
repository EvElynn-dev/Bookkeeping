export type MemberId = 'me' | 'partner';

export type Category = {
  id: string;
  label: string;
  emoji: string;
  tint: string;
};

export type Expense = {
  id: string;
  title: string;
  amountFen: number;
  categoryId: string;
  categoryLabel: string;
  categoryEmoji: string;
  note?: string;
  spentAt: string;
  payerId: MemberId;
  participants: MemberId[];
};

export const members: Record<MemberId, { name: string; emoji: string }> = {
  me: { name: '我', emoji: '🪶' },
  partner: { name: '小皮皮', emoji: '🐼' },
};

export const categories: Category[] = [
  { id: 'food', label: '餐饮', emoji: '🍜', tint: '#FDEDC9' },
  { id: 'shopping', label: '购物', emoji: '🛒', tint: '#E7F0FF' },
  { id: 'transport', label: '交通', emoji: '🚗', tint: '#FFE8D8' },
  { id: 'home', label: '住房', emoji: '🏠', tint: '#FFF0D9' },
  { id: 'fun', label: '休闲娱乐', emoji: '🏀', tint: '#FFE3DD' },
  { id: 'health', label: '医疗健康', emoji: '🧸', tint: '#FFF1D1' },
  { id: 'study', label: '学习办公', emoji: '📖', tint: '#FDE4E7' },
  { id: 'pet', label: '宠物', emoji: '🐱', tint: '#FFF5D9' },
  { id: 'parent', label: '母婴', emoji: '👶', tint: '#FFF0D7' },
  { id: 'transfer', label: '资金往来', emoji: '💰', tint: '#FFE6B8' },
  { id: 'other', label: '其他', emoji: '✨', tint: '#E8E9FF' },
];

export const demoExpenses: Expense[] = [
  {
    id: '1',
    title: '晚餐',
    amountFen: 1488,
    categoryId: 'food',
    categoryLabel: '晚饭',
    categoryEmoji: '🍜',
    note: '一起吃的晚餐',
    spentAt: '2026-10-06T21:45:00',
    payerId: 'me',
    participants: ['me'],
  },
  {
    id: '2',
    title: '看病买药',
    amountFen: 4826,
    categoryId: 'health',
    categoryLabel: '药',
    categoryEmoji: '🧸',
    spentAt: '2026-10-06T21:15:00',
    payerId: 'partner',
    participants: ['me'],
  },
  {
    id: '3',
    title: '生活用品',
    amountFen: 1168,
    categoryId: 'shopping',
    categoryLabel: '日用',
    categoryEmoji: '🛒',
    spentAt: '2026-10-06T19:20:00',
    payerId: 'me',
    participants: ['me', 'partner'],
  },
  {
    id: '4',
    title: '猫粮',
    amountFen: 8900,
    categoryId: 'pet',
    categoryLabel: '宠物',
    categoryEmoji: '🐱',
    spentAt: '2026-10-05T11:30:00',
    payerId: 'partner',
    participants: ['me', 'partner'],
  },
];

export const formatMoney = (amountFen: number, withSign = false) => {
  const sign = amountFen < 0 ? '-' : withSign ? '+' : '';
  return `${sign}¥${Math.abs(amountFen / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
