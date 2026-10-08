import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api, AuthResponse, BalanceEntry, Book } from './src/api';
import { checkForAppUpdate } from './src/update';
import {
  categories,
  demoExpenses,
  Expense,
  formatDate,
  formatMoney,
  formatTime,
  MemberId,
  members,
} from './src/data';
import { colors, radii, shadow } from './src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function AppIcon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function Avatar({ member, size = 34 }: { member: MemberId; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.56 }}>{members[member].emoji}</Text>
    </View>
  );
}

function Pill({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'gray' | 'green' }) {
  const toneStyles = {
    blue: { backgroundColor: colors.primarySoft, color: colors.primary },
    gray: { backgroundColor: '#F2F3F7', color: colors.muted },
    green: { backgroundColor: '#E2F7EF', color: colors.green },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: toneStyles.backgroundColor }]}>
      <Text style={[styles.pillText, { color: toneStyles.color }]}>{children}</Text>
    </View>
  );
}

function Header({ onMenu, onBooks }: { onMenu: () => void; onBooks: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="打开菜单" onPress={onMenu} style={styles.iconButton}>
        <AppIcon name="menu-outline" size={27} color={colors.secondaryInk} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="当前页面：记录" style={styles.titleButton}>
        <Text style={styles.pageTitle}>记录</Text>
        <AppIcon name="chevron-down" size={17} color={colors.muted} />
      </Pressable>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="搜索记录" style={styles.searchButton}>
          <AppIcon name="search-outline" size={23} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="选择账本" onPress={onBooks} style={styles.bookButton}>
          <MaterialCommunityIcons name="notebook-outline" size={20} color={colors.secondaryInk} />
          <Text numberOfLines={1} style={styles.bookButtonText}>饲养pup...</Text>
          <AppIcon name="chevron-down" size={17} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function SummaryCard({ expenses, balance, currentUserId }: { expenses: Expense[]; balance?: BalanceEntry[]; currentUserId?: string }) {
  const total = expenses.reduce((sum, expense) => sum + expense.amountFen, 0);
  const localMe = expenses.filter((expense) => expense.payerId === 'me').reduce((sum, expense) => sum + expense.amountFen, 0);
  const localPartner = expenses.filter((expense) => expense.payerId === 'partner').reduce((sum, expense) => sum + expense.amountFen, 0);
  const remoteMe = balance?.find((entry) => entry.id === currentUserId)?.net_fen;
  const remotePartner = balance?.find((entry) => entry.id !== currentUserId)?.net_fen;
  const me = remoteMe ?? -localMe;
  const partner = remotePartner ?? -localPartner;
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View style={styles.monthSelect}>
          <Text style={styles.monthText}>2026年10月</Text>
          <AppIcon name="chevron-down" size={18} color={colors.muted} />
        </View>
        <Pressable style={styles.statsButton}>
          <Text style={styles.statsButtonText}>统计</Text>
          <AppIcon name="chevron-forward" size={15} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.monthExpenseBlock}>
        <View style={styles.labelWithLine}>
          <View style={[styles.labelLine, { backgroundColor: colors.primary }]} />
          <Text style={styles.summaryLabel}>月支出</Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} style={styles.totalAmount}>{formatMoney(total)}</Text>
        <AppIcon name="eye-outline" size={19} color={colors.faint} />
      </View>
      <View style={styles.summaryBottom}>
        <View>
          <View style={styles.labelWithLine}>
            <View style={[styles.labelLine, { backgroundColor: colors.orange }]} />
            <Text style={styles.smallSummaryLabel}>月收入</Text>
          </View>
          <Text style={styles.smallAmount}>¥0.00</Text>
        </View>
        <View>
          <View style={styles.labelWithLine}>
            <View style={[styles.labelLine, { backgroundColor: colors.green }]} />
            <Text style={styles.smallSummaryLabel}>月结余</Text>
          </View>
          <Text style={[styles.smallAmount, { color: colors.ink }]}>−{formatMoney(total)}</Text>
        </View>
        <View style={styles.budgetRing}>
          <Text style={styles.budgetTitle}>设置预算</Text>
          <Text style={styles.budgetSub}>一起规划开支</Text>
          <Text style={styles.budgetArrow}>→</Text>
        </View>
      </View>
      <View style={styles.coupleBar}>
        <View style={styles.couplePerson}>
          <Avatar member="me" size={32} />
          <Text style={styles.coupleName}>我</Text>
          <Text numberOfLines={1} style={styles.coupleAmount}>{formatMoney(me, true)}</Text>
        </View>
        <View style={styles.coupleDivider} />
        <View style={styles.couplePerson}>
          <Avatar member="partner" size={32} />
          <Text style={styles.coupleName}>{members.partner.name}</Text>
          <Text numberOfLines={1} style={styles.coupleAmount}>{formatMoney(partner, true)}</Text>
        </View>
      </View>
    </View>
  );
}

function ExpenseRow({ expense, onPress }: { expense: Expense; onPress: () => void }) {
  const isShared = expense.participants.length > 1;
  return (
    <Pressable style={styles.expenseRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={`编辑${expense.title}`}>
      <View style={[styles.categoryIcon, { backgroundColor: categories.find((category) => category.id === expense.categoryId)?.tint ?? '#F2F3F7' }]}>
        <Text style={styles.categoryEmoji}>{expense.categoryEmoji}</Text>
      </View>
      <View style={styles.expenseInfo}>
        <Text style={styles.expenseTitle}>{expense.title}</Text>
        <Text style={styles.expenseMeta}>{formatTime(expense.spentAt)}  |  {expense.categoryLabel} {expense.note ? ` · ${expense.note}` : ''}</Text>
        <View style={styles.expenseTags}>
          <Pill tone="blue">{isShared ? '共同分摊' : expense.payerId === 'me' ? '我参与' : '对方记录'}</Pill>
          {!isShared && <Pill tone="gray">不分摊 · 1人</Pill>}
        </View>
      </View>
      <Text style={styles.expenseAmount}>−{formatMoney(expense.amountFen)}</Text>
    </Pressable>
  );
}

function ExpenseList({ expenses, onExpensePress }: { expenses: Expense[]; onExpensePress: (expense: Expense) => void }) {
  const groups = expenses.reduce<Record<string, Expense[]>>((acc, expense) => {
    const date = formatDate(expense.spentAt);
    acc[date] = [...(acc[date] ?? []), expense];
    return acc;
  }, {});
  return (
    <View style={styles.listCard}>
      {Object.entries(groups).map(([date, items]) => (
        <View key={date}>
          <View style={styles.dateRow}>
            <Text style={styles.dateTitle}>{date} <Text style={styles.dateWeekday}>({new Date(items[0].spentAt).toLocaleDateString('zh-CN', { weekday: 'short' })})</Text></Text>
            <Text style={styles.dateTotal}>支 ¥{(items.reduce((sum, item) => sum + item.amountFen, 0) / 100).toFixed(2)}  |  收 ¥0.00</Text>
          </View>
          {items.map((expense, index) => (
            <View key={expense.id}>
              <ExpenseRow expense={expense} onPress={() => onExpensePress(expense)} />
              {index < items.length - 1 && <View style={styles.rowDivider} />}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function QuickBar({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.quickBarWrap}>
      <View style={styles.quickBar}>
        <Text style={styles.quickAvatar}>🦊</Text>
        <Text style={styles.quickPlaceholder}>任何事情都能问我</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="语音输入" style={styles.quickIconButton}>
          <AppIcon name="mic-outline" size={23} color={colors.secondaryInk} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="新增记账" onPress={onAdd} style={styles.quickIconButton}>
          <AppIcon name="add" size={28} color={colors.secondaryInk} />
        </Pressable>
      </View>
    </View>
  );
}

function HomeScreen({
  expenses,
  balance,
  currentUserId,
  onMenu,
  onBooks,
  onAdd,
  onExpensePress,
}: {
  expenses: Expense[];
  balance?: BalanceEntry[];
  currentUserId?: string;
  onMenu: () => void;
  onBooks: () => void;
  onAdd: () => void;
  onExpensePress: (expense: Expense) => void;
}) {
  return (
    <View style={styles.flex}>
      <Header onMenu={onMenu} onBooks={onBooks} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.homeContent}>
        <SummaryCard expenses={expenses} balance={balance} currentUserId={currentUserId} />
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>记录明细</Text>
          <AppIcon name="chevron-forward" size={22} color={colors.faint} />
          <Pressable style={styles.exportButton} accessibilityRole="button" accessibilityLabel="导出账单">
            <MaterialCommunityIcons name="cash-register" size={21} color={colors.primary} />
          </Pressable>
        </View>
        <ExpenseList expenses={expenses} onExpensePress={onExpensePress} />
      </ScrollView>
      <QuickBar onAdd={onAdd} />
    </View>
  );
}

const drawerFeatures: { label: string; icon: IconName }[] = [
  { label: '图表统计', icon: 'pie-chart-outline' },
  { label: '资产管理', icon: 'card-outline' },
  { label: '账本管理', icon: 'book-outline' },
  { label: '预算管理', icon: 'create-outline' },
  { label: '攒钱计划', icon: 'cash-outline' },
  { label: '小组件', icon: 'grid-outline' },
  { label: '分类管理', icon: 'apps-outline' },
  { label: '标签管理', icon: 'bookmark-outline' },
];

function Drawer({ onClose, onAuth, onBalance, onCheckUpdate, sessionName }: { onClose: () => void; onAuth: () => void; onBalance: () => void; onCheckUpdate: () => void; sessionName?: string }) {
  const { width } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭菜单" />
        <View style={[styles.drawer, { width: Math.min(350, width * 0.86) }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
            <Pressable style={styles.profileHeader} onPress={onAuth} accessibilityRole="button" accessibilityLabel="登录账号">
              <Avatar member="me" size={54} />
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{sessionName ?? '小皮皮'}</Text>
                <Text style={styles.profileSub}>{sessionName ? '已连接自建服务器' : '连接自建服务器 · 点击登录'}</Text>
              </View>
              <AppIcon name="chevron-forward" size={21} color={colors.faint} />
            </Pressable>
            <View style={styles.healthCard}>
              <View style={styles.healthCopy}>
                <Text style={styles.healthTitle}>财务健康分 <Text style={{ color: '#7D67EA' }}>✦</Text></Text>
                <View style={styles.healthScoreRow}><Text style={styles.healthScore}>72</Text><Text style={styles.healthUnit}>人上人</Text></View>
                <Text style={styles.healthDescription}>本周支出略涨，数码电器大额支出拉动，整体仍处上升</Text>
              </View>
              <View style={styles.radar}><Text style={styles.radarText}>✦</Text></View>
            </View>
            <View style={styles.drawerStats}>
              <View><Text style={styles.drawerStatValue}>37</Text><Text style={styles.drawerStatLabel}>记录天数</Text></View>
              <View><Text style={styles.drawerStatValue}>164</Text><Text style={styles.drawerStatLabel}>总记录</Text></View>
              <View><Text style={styles.drawerStatValue}>37</Text><Text style={styles.drawerStatLabel}>连续天数</Text></View>
            </View>
            <Text style={styles.drawerSectionTitle}>更多功能</Text>
            <View style={styles.featureGrid}>
              {drawerFeatures.map((feature) => (
                <Pressable key={feature.label} style={styles.featureItem} accessibilityRole="button" accessibilityLabel={feature.label}>
                  <AppIcon name={feature.icon} size={27} color={colors.secondaryInk} />
                  <Text style={styles.featureLabel}>{feature.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.drawerSectionTitle}>快捷记账</Text>
            <View style={styles.quickGrid}>
              <QuickAction icon="document-text-outline" label="导入导出" />
              <QuickAction icon="document-attach-outline" label="自动记账" />
              <QuickAction icon="refresh-outline" label="定时记账" />
            </View>
            <View style={styles.drawerLinks}>
              <DrawerLink icon="cloud-download-outline" label="检查更新" onPress={onCheckUpdate} />
              <DrawerLink icon="settings-outline" label="设置" />
              <DrawerLink icon="receipt-outline" label="填问卷参与共建" />
              <DrawerLink icon="wallet-outline" label="双人结算" onPress={onBalance} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function QuickAction({ icon, label }: { icon: IconName; label: string }) {
  return <Pressable style={styles.quickAction}><AppIcon name={icon} size={26} color={colors.secondaryInk} /><Text style={styles.quickActionLabel}>{label}</Text></Pressable>;
}

function DrawerLink({ icon, label, onPress }: { icon: IconName; label: string; onPress?: () => void }) {
  return <Pressable onPress={onPress} style={styles.drawerLink}><AppIcon name={icon} size={23} color={colors.secondaryInk} /><Text style={styles.drawerLinkText}>{label}</Text><AppIcon name="chevron-forward" size={19} color={colors.faint} /></Pressable>;
}

function BookPicker({ onClose, onManage, book }: { onClose: () => void; onManage: () => void; book: Book | null }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.bookPicker}>
          <View style={styles.pickerHeader}><Text style={styles.pickerTitle}>📒 总账本</Text><AppIcon name="ellipsis-horizontal" size={22} color={colors.muted} /></View>
          <Pressable style={styles.bookOption} onPress={onClose}>
            <AppIcon name="checkmark" size={21} color={colors.primary} />
            <Text style={styles.bookEmoji}>📕</Text>
            <Text style={styles.bookOptionText}>{book?.name ?? '饲养pup...'}</Text>
            <View style={styles.tinyAvatars}><Avatar member="me" size={25} /><Avatar member="partner" size={25} /></View>
            <AppIcon name="ellipsis-horizontal" size={19} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.addBookButton} onPress={onManage}><AppIcon name="add" size={26} color={colors.muted} /><Text style={styles.addBookText}>管理账本 / 加入邀请码</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BookManagerModal({
  onClose,
  onAuth,
  session,
  book,
  onBookChange,
}: {
  onClose: () => void;
  onAuth: () => void;
  session: AuthResponse | null;
  book: Book | null;
  onBookChange: (book: Book) => void;
}) {
  const [inviteCode, setInviteCode] = useState('');
  const [bookName, setBookName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async () => {
    if (!session || inviteCode.trim().length !== 6) {
      setMessage('请输入 6 位邀请码');
      return;
    }
    setBusy(true);
    try {
      const nextBook = await api.joinBook(session.token, inviteCode.trim());
      onBookChange(nextBook);
      setMessage(`已加入「${nextBook.name}」`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加入失败');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!session || !bookName.trim()) {
      setMessage('请输入账本名称');
      return;
    }
    setBusy(true);
    try {
      const nextBook = await api.createBook(session.token, bookName.trim());
      onBookChange(nextBook);
      setBookName('');
      setMessage(`已创建「${nextBook.name}」，邀请码：${nextBook.invite_code}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.manageScreen}>
        <View style={styles.authHeader}><Pressable onPress={onClose}><AppIcon name="chevron-down" size={28} color={colors.secondaryInk} /></Pressable><Text style={styles.authTitle}>账本管理</Text><View style={{ width: 28 }} /></View>
        {!session ? (
          <View style={styles.manageEmpty}>
            <Text style={styles.manageEmoji}>📒</Text>
            <Text style={styles.manageTitle}>先连接自己的服务器</Text>
            <Text style={styles.manageDescription}>登录后才能创建账本或输入邀请码加入另一台设备的账本。</Text>
            <Pressable style={styles.authSubmit} onPress={onAuth}><Text style={styles.authSubmitText}>去登录 / 注册</Text></Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.manageBody}>
            <View style={styles.currentBookCard}>
              <Text style={styles.manageEyebrow}>当前账本</Text>
              <Text style={styles.currentBookName}>{book?.name ?? '还没有账本'}</Text>
              {book?.invite_code && <Text style={styles.inviteHint}>把邀请码发给另一位成员：{book.invite_code}</Text>}
              <View style={styles.memberList}>
                {(book?.members ?? []).map((member, index) => <View style={styles.memberRow} key={member.id}><Avatar member={index === 0 ? 'me' : 'partner'} size={32} /><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberEmail}>{member.email}</Text></View>)}
              </View>
            </View>
            <Text style={styles.manageSectionTitle}>加入已有账本</Text>
            <TextInput autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} placeholder="输入 6 位邀请码" placeholderTextColor={colors.faint} style={styles.authInput} maxLength={6} />
            <Pressable style={[styles.authSubmit, busy && { opacity: 0.55 }]} disabled={busy} onPress={join}><Text style={styles.authSubmitText}>{busy ? '处理中…' : '加入账本'}</Text></Pressable>
            <Text style={styles.manageSectionTitle}>新建账本</Text>
            <TextInput value={bookName} onChangeText={setBookName} placeholder="例如：饲养 pup" placeholderTextColor={colors.faint} style={styles.authInput} />
            <Pressable style={styles.secondarySubmit} onPress={create}><Text style={styles.secondarySubmitText}>创建新账本</Text></Pressable>
            {!!message && <Text style={styles.manageMessage}>{message}</Text>}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function BalanceModal({
  onClose,
  session,
  book,
  expenses,
  onSettled,
}: {
  onClose: () => void;
  session: AuthResponse | null;
  book: Book | null;
  expenses: Expense[];
  onSettled: () => Promise<void> | void;
}) {
  const [entries, setEntries] = useState<BalanceEntry[]>([]);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const localEntries = useMemo(() => {
    const paid = { me: 0, partner: 0 };
    const owed = { me: 0, partner: 0 };
    expenses.forEach((expense) => {
      paid[expense.payerId] += expense.amountFen;
      const share = Math.floor(expense.amountFen / expense.participants.length);
      expense.participants.forEach((member, index) => { owed[member] += share + (index === 0 ? expense.amountFen % expense.participants.length : 0); });
    });
    return [
      { id: 'me', name: '我', paid_fen: paid.me, owed_fen: owed.me, net_fen: paid.me - owed.me },
      { id: 'partner', name: members.partner.name, paid_fen: paid.partner, owed_fen: owed.partner, net_fen: paid.partner - owed.partner },
    ];
  }, [expenses]);

  const refresh = async () => {
    if (!session || !book) return;
    try {
      const result = await api.getBalance(session.token, book.id);
      setEntries(result.members);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '暂时无法读取余额');
    }
  };

  useEffect(() => { void refresh(); }, [session?.token, book?.id]);

  const displayedEntries = session && book ? entries : localEntries;
  const me = displayedEntries[0];
  const partner = displayedEntries[1];
  const positive = me && me.net_fen >= 0 ? me : partner;
  const negative = positive === me ? partner : me;
  const suggested = positive && negative ? Math.abs(negative.net_fen) : 0;

  const settle = async () => {
    const amountFen = Math.round(Number(amount || suggested / 100) * 100);
    if (!amountFen) {
      setMessage('请输入结算金额');
      return;
    }
    if (!session || !book || !positive || !negative) {
      setMessage('登录并加入双人账本后才能保存结算');
      return;
    }
    setBusy(true);
    try {
      await api.createSettlement(session.token, book.id, { from_id: negative.id, to_id: positive.id, amount_fen: amountFen, settled_at: new Date().toISOString() });
      setAmount('');
      setMessage('已记录结算');
      await refresh();
      await onSettled();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存结算失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.manageScreen}>
        <View style={styles.authHeader}><Pressable onPress={onClose}><AppIcon name="chevron-down" size={28} color={colors.secondaryInk} /></Pressable><Text style={styles.authTitle}>双人结算</Text><View style={{ width: 28 }} /></View>
        <ScrollView contentContainerStyle={styles.manageBody}>
          <View style={styles.balanceHero}>
            <Text style={styles.manageEyebrow}>当前应结算</Text>
            <Text style={styles.balanceAmount}>{positive && negative ? formatMoney(Math.abs(negative.net_fen)) : '¥0.00'}</Text>
            <Text style={styles.balanceDescription}>{positive && negative && Math.abs(negative.net_fen) > 0 ? `${negative.name} 应给 ${positive.name}` : '你们已经结清啦'}</Text>
          </View>
          <View style={styles.balanceRows}>
            {displayedEntries.map((entry) => <View style={styles.balanceRow} key={entry.id}><Avatar member={entry.id === 'me' || entry.id === session?.user.id ? 'me' : 'partner'} size={38} /><View style={{ flex: 1 }}><Text style={styles.memberName}>{entry.name}</Text><Text style={styles.memberEmail}>已支付 {formatMoney(entry.paid_fen)} · 应承担 {formatMoney(entry.owed_fen)}</Text></View><Text style={[styles.balanceNet, { color: entry.net_fen >= 0 ? colors.green : colors.red }]}>{entry.net_fen >= 0 ? '+' : '−'}{formatMoney(Math.abs(entry.net_fen))}</Text></View>)}
          </View>
          <Text style={styles.manageSectionTitle}>记录一笔结算</Text>
          <TextInput keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder={suggested ? `建议 ¥${(suggested / 100).toFixed(2)}` : '输入金额'} placeholderTextColor={colors.faint} style={styles.authInput} />
          <Pressable style={[styles.authSubmit, busy && { opacity: 0.55 }]} disabled={busy} onPress={settle}><Text style={styles.authSubmitText}>{busy ? '保存中…' : '确认结算'}</Text></Pressable>
          {!!message && <Text style={styles.manageMessage}>{message}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function CategoryPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <View style={styles.categoryGrid}>
      {categories.map((category) => (
        <Pressable key={category.id} style={styles.categoryItem} onPress={() => onSelect(category.id)} accessibilityRole="button" accessibilityLabel={category.label}>
          <View style={[styles.categoryLargeIcon, { backgroundColor: category.tint }, selected === category.id && styles.categorySelected]}><Text style={styles.categoryLargeEmoji}>{category.emoji}</Text></View>
          <Text style={[styles.categoryLabel, selected === category.id && { color: colors.primary, fontWeight: '700' }]}>{category.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ExpenseSheet({ onClose, onSave }: { onClose: () => void; onSave: (expense: Expense) => void }) {
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [amount, setAmount] = useState('0');
  const [split, setSplit] = useState<'me' | 'partner' | 'both'>('me');
  const [note, setNote] = useState('');
  const currentCategory = categories.find((category) => category.id === selectedCategory) ?? categories[0];

  const pressKey = (key: string) => {
    if (key === 'delete') {
      setAmount((value) => (value.length <= 1 ? '0' : value.slice(0, -1)));
      return;
    }
    if (key === '.' && amount.includes('.')) return;
    if (amount === '0' && key !== '.') setAmount(key);
    else if (amount.length < 9) setAmount((value) => value + key);
  };

  const save = () => {
    const amountFen = Math.round(Number(amount) * 100);
    if (!amountFen) return;
    const participants: MemberId[] = split === 'both' ? ['me', 'partner'] : [split];
    onSave({
      id: String(Date.now()),
      title: currentCategory.label,
      amountFen,
      categoryId: currentCategory.id,
      categoryLabel: currentCategory.label,
      categoryEmoji: currentCategory.emoji,
      note: note.trim() || undefined,
      spentAt: new Date().toISOString(),
      payerId: split === 'partner' ? 'partner' : 'me',
      participants,
    });
    setAmount('0');
    setNote('');
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.expenseSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTabs}><Text style={styles.activeSheetTab}>支出</Text><Text style={styles.inactiveSheetTab}>收入</Text><Text style={styles.inactiveSheetTab}>转账</Text></View>
            <Pressable style={styles.aiButton}><Text style={styles.aiButtonText}>⇄ AI助手</Text></Pressable>
            <Pressable onPress={onClose} style={styles.closeButton}><AppIcon name="close" size={22} color={colors.secondaryInk} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
            <CategoryPicker selected={selectedCategory} onSelect={setSelectedCategory} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              <FilterChip icon="calendar-outline" label="10月7日" />
              <FilterChip icon="book-outline" label="饲养 pup..." />
              <FilterChip icon="pie-chart-outline" label={split === 'both' ? '共同分摊' : '不分摊 · 全额'} active />
              <FilterChip icon="wallet-outline" label="无账户" />
              <FilterChip icon="pricetag-outline" label="优惠" />
              <FilterChip icon="receipt-outline" label="计入收支" />
              <FilterChip icon="bookmark-outline" label="标签" />
            </ScrollView>
            <View style={styles.amountCard}>
              <View style={styles.amountRow}><Text style={styles.amountDisplay}>¥{amount}</Text><Text style={styles.currencyText}>CNY⌃</Text></View>
              <View style={styles.amountDivider} />
              <View style={styles.noteRow}><TextInput value={note} onChangeText={setNote} placeholder="点击填写备注信息" placeholderTextColor={colors.faint} style={styles.noteInput} /><AppIcon name="image-outline" size={25} color={colors.muted} /><AppIcon name="camera-outline" size={25} color={colors.muted} /></View>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>由谁承担</Text>
              <Pressable onPress={() => setSplit('me')}><Pill tone={split === 'me' ? 'blue' : 'gray'}>我承担</Pill></Pressable>
              <Pressable onPress={() => setSplit('partner')}><Pill tone={split === 'partner' ? 'blue' : 'gray'}>对方承担</Pill></Pressable>
              <Pressable onPress={() => setSplit('both')}><Pill tone={split === 'both' ? 'blue' : 'gray'}>共同</Pill></Pressable>
            </View>
            <View style={styles.keypad}>
              {['1', '2', '3', 'delete', '4', '5', '6', '+', '7', '8', '9', '−', '再记', '0', '.', '完成'].map((key) => (
                <Pressable key={key} onPress={() => key === '完成' ? save() : key === '再记' ? setAmount('0') : pressKey(key)} style={[styles.key, key === '完成' && styles.doneKey, key === '再记' && styles.repeatKey]}>
                  {key === 'delete' ? <AppIcon name="backspace-outline" size={25} color={colors.secondaryInk} /> : <Text style={[styles.keyText, key === '完成' && styles.doneKeyText, key === '再记' && styles.repeatKeyText]}>{key}</Text>}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FilterChip({ icon, label, active = false }: { icon: IconName; label: string; active?: boolean }) {
  return <View style={[styles.filterChip, active && styles.activeFilterChip]}><AppIcon name={icon} size={17} color={active ? colors.primary : colors.secondaryInk} /><Text style={[styles.filterChipText, active && { color: colors.primary }]}>{label}</Text></View>;
}

function ExpenseActionModal({
  expense,
  onClose,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.expenseActionCard}>
          <View style={styles.expenseActionIcon}><Text style={styles.categoryLargeEmoji}>{expense.categoryEmoji}</Text></View>
          <Text style={styles.expenseActionTitle}>{expense.title}</Text>
          <Text style={styles.expenseActionAmount}>−{formatMoney(expense.amountFen)}</Text>
          <Text style={styles.expenseActionMeta}>{formatDate(expense.spentAt)} · {expense.categoryLabel}{expense.note ? ` · ${expense.note}` : ''}</Text>
          <View style={styles.expenseActionButtons}>
            <Pressable style={styles.expenseActionButton} onPress={onEdit}><AppIcon name="create-outline" size={20} color={colors.primary} /><Text style={styles.expenseActionButtonText}>编辑</Text></Pressable>
            <Pressable style={[styles.expenseActionButton, styles.expenseDeleteButton]} onPress={onDelete}><AppIcon name="trash-outline" size={20} color={colors.red} /><Text style={[styles.expenseActionButtonText, { color: colors.red }]}>删除</Text></Pressable>
          </View>
          <Pressable style={styles.expenseCancelButton} onPress={onClose}><Text style={styles.expenseCancelText}>取消</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ExpenseEditModal({
  expense,
  onClose,
  onSave,
}: {
  expense: Expense;
  onClose: () => void;
  onSave: (expense: Expense) => void;
}) {
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState((expense.amountFen / 100).toFixed(2));
  const [note, setNote] = useState(expense.note ?? '');
  const [message, setMessage] = useState('');

  const save = () => {
    const amountFen = Math.round(Number(amount) * 100);
    if (!title.trim()) {
      setMessage('请填写支出名称');
      return;
    }
    if (!Number.isFinite(amountFen) || amountFen <= 0) {
      setMessage('请输入有效金额');
      return;
    }
    onSave({ ...expense, title: title.trim(), amountFen, note: note.trim() || undefined });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.manageScreen}>
        <View style={styles.authHeader}><Pressable onPress={onClose}><AppIcon name="chevron-down" size={28} color={colors.secondaryInk} /></Pressable><Text style={styles.authTitle}>编辑支出</Text><View style={{ width: 28 }} /></View>
        <ScrollView contentContainerStyle={styles.manageBody}>
          <View style={styles.currentBookCard}>
            <View style={styles.editCategoryRow}><View style={[styles.categoryIcon, { backgroundColor: categories.find((category) => category.id === expense.categoryId)?.tint ?? '#F2F3F7' }]}><Text style={styles.categoryEmoji}>{expense.categoryEmoji}</Text></View><View><Text style={styles.manageEyebrow}>{expense.categoryLabel}</Text><Text style={styles.editSplitText}>{expense.participants.length > 1 ? '共同分摊' : expense.payerId === 'me' ? '我承担' : '对方承担'}</Text></View></View>
          </View>
          <Text style={styles.manageSectionTitle}>名称</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="例如：晚餐" placeholderTextColor={colors.faint} style={styles.authInput} />
          <Text style={styles.manageSectionTitle}>金额（人民币）</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.faint} style={styles.authInput} />
          <Text style={styles.manageSectionTitle}>备注</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="可选" placeholderTextColor={colors.faint} style={[styles.authInput, styles.editNoteInput]} multiline />
          <Pressable style={styles.authSubmit} onPress={save}><Text style={styles.authSubmitText}>保存修改</Text></Pressable>
          {!!message && <Text style={styles.authMessage}>{message}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (result: AuthResponse) => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const submit = async () => {
    try {
      const result = register ? await api.register(email, password, name || '记账用户') : await api.login(email, password);
      setMessage(`已连接服务器：${result.user.name}`);
      onSuccess(result);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '连接失败，请检查服务器地址');
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.authScreen}>
        <View style={styles.authHeader}><Pressable onPress={onClose}><AppIcon name="chevron-down" size={28} color={colors.secondaryInk} /></Pressable><Text style={styles.authTitle}>{register ? '注册账号' : '登录账号'}</Text><View style={{ width: 28 }} /></View>
        <View style={styles.authBody}>
          <Text style={styles.authBrand}>一起记账</Text>
          <Text style={styles.authIntro}>连接你们自己的服务器，随时同步共同支出。</Text>
          {register && <TextInput autoCapitalize="none" placeholder="你的昵称" placeholderTextColor={colors.faint} value={name} onChangeText={setName} style={styles.authInput} />}
          <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="邮箱" placeholderTextColor={colors.faint} value={email} onChangeText={setEmail} style={styles.authInput} />
          <TextInput secureTextEntry placeholder="密码" placeholderTextColor={colors.faint} value={password} onChangeText={setPassword} style={styles.authInput} />
          <Pressable onPress={submit} style={styles.authSubmit}><Text style={styles.authSubmitText}>{register ? '注册并连接' : '登录并连接'}</Text></Pressable>
          {!!message && <Text style={styles.authMessage}>{message}</Text>}
          <Pressable onPress={() => setRegister((value) => !value)}><Text style={styles.authToggle}>{register ? '已有账号？去登录' : '还没有账号？去注册'}</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function App() {
  const SESSION_KEY = 'together-ledger-session';
  const [expenses, setExpenses] = useState<Expense[]>(demoExpenses);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [serverBook, setServerBook] = useState<Book | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [bookPickerVisible, setBookPickerVisible] = useState(false);
  const [bookManagerVisible, setBookManagerVisible] = useState(false);
  const [expenseVisible, setExpenseVisible] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [balanceEntries, setBalanceEntries] = useState<BalanceEntry[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseActionVisible, setExpenseActionVisible] = useState(false);
  const [expenseEditVisible, setExpenseEditVisible] = useState(false);

  useEffect(() => {
    void checkForAppUpdate();
  }, []);

  const sortedExpenses = useMemo(() => [...expenses].sort((a, b) => b.spentAt.localeCompare(a.spentAt)), [expenses]);

  const applyRemoteBook = async (result: AuthResponse, book: Book) => {
    setServerBook(book);
    if (book.members.length === 0) return;
    const partner = book.members.find((member) => member.id !== result.user.id);
    const memberIds = { me: result.user.id, partner: partner?.id ?? result.user.id };
    const remoteExpenses = await api.listExpenses(result.token, book.id) as Array<Record<string, unknown>>;
    const mapped = remoteExpenses.map((item) => ({
      id: String(item.id),
      title: String(item.title),
      amountFen: Number(item.amount_fen),
      categoryId: String(item.category_id),
      categoryLabel: String(item.category_label),
      categoryEmoji: categories.find((category) => category.id === item.category_id)?.emoji ?? '✨',
      note: item.note ? String(item.note) : undefined,
      spentAt: String(item.spent_at),
      payerId: item.payer_id === memberIds.me ? 'me' : 'partner',
      participants: (Array.isArray(item.participants) ? item.participants : []).map((id) => id === memberIds.me ? 'me' : 'partner'),
    } as Expense));
    setExpenses(mapped);
    try {
      const balance = await api.getBalance(result.token, book.id);
      setBalanceEntries(balance.members);
    } catch {
      setBalanceEntries([]);
    }
  };

  const applyRemoteSession = async (result: AuthResponse) => {
    setSession(result);
    try {
      const books = await api.listBooks(result.token);
      const book = books[0] ?? await api.createBook(result.token, '饲养pup');
      await applyRemoteBook(result, book);
    } catch {
      // The UI remains usable with the seeded local data if the self-hosted API is unavailable.
    }
  };

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(SESSION_KEY).then((raw) => {
      if (!raw || cancelled) return;
      try {
        const saved = JSON.parse(raw) as AuthResponse;
        void applyRemoteSession(saved);
      } catch {
        void SecureStore.deleteItemAsync(SESSION_KEY);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleAuthSuccess = async (result: AuthResponse) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(result));
    await applyRemoteSession(result);
  };

  const handleCheckUpdate = () => {
    setDrawerVisible(false);
    void checkForAppUpdate({ notifyIfCurrent: true, notifyOnError: true });
  };

  const handleBookChange = async (book: Book) => {
    setServerBook(book);
    setBookManagerVisible(false);
    if (session) {
      try {
        await applyRemoteBook(session, book);
      } catch {
        // Keep the previous local data visible if the new book has no readable expenses yet.
      }
    }
  };

  const refreshRemoteBook = async () => {
    if (!session || !serverBook) return;
    try {
      await applyRemoteBook(session, serverBook);
    } catch {
      // Keep the optimistic local state visible if the self-hosted API is temporarily unavailable.
    }
  };

  const remoteMemberId = (member: MemberId) => {
    if (!session || !serverBook) return undefined;
    const partnerId = serverBook.members.find((bookMember) => bookMember.id !== session.user.id)?.id ?? session.user.id;
    return member === 'me' ? session.user.id : partnerId;
  };

  const remoteExpensePayload = (expense: Expense) => ({
    amount_fen: expense.amountFen,
    title: expense.title,
    category_id: expense.categoryId,
    category_label: expense.categoryLabel,
    note: expense.note,
    spent_at: expense.spentAt,
    payer_id: remoteMemberId(expense.payerId),
    participants: expense.participants.map(remoteMemberId),
  });

  const saveExpense = (expense: Expense) => {
    setExpenses((items) => [expense, ...items]);
    if (session && serverBook) {
      void api.createExpense(session.token, serverBook.id, remoteExpensePayload(expense)).then(refreshRemoteBook).catch(() => undefined);
    }
  };

  const openExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setExpenseActionVisible(true);
  };

  const updateExpense = (nextExpense: Expense) => {
    if (!selectedExpense) return;
    const previousExpenses = expenses;
    setExpenses((items) => items.map((item) => item.id === nextExpense.id ? nextExpense : item));
    setExpenseEditVisible(false);
    setSelectedExpense(null);
    if (session && serverBook) {
      void api.updateExpense(session.token, serverBook.id, nextExpense.id, remoteExpensePayload(nextExpense))
        .then(refreshRemoteBook)
        .catch((error) => {
          setExpenses(previousExpenses);
          Alert.alert('保存失败', error instanceof Error ? error.message : '暂时无法同步这笔支出');
        });
    }
  };

  const deleteExpense = (expense: Expense) => {
    Alert.alert('删除这笔支出？', `「${expense.title}」将从账本中移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          const previousExpenses = expenses;
          setExpenses((items) => items.filter((item) => item.id !== expense.id));
          setExpenseActionVisible(false);
          setSelectedExpense(null);
          if (session && serverBook) {
            void api.deleteExpense(session.token, serverBook.id, expense.id)
              .then(refreshRemoteBook)
              .catch((error) => {
                setExpenses(previousExpenses);
                Alert.alert('删除失败', error instanceof Error ? error.message : '暂时无法同步删除操作');
              });
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <HomeScreen expenses={sortedExpenses} balance={balanceEntries} currentUserId={session?.user.id} onMenu={() => setDrawerVisible(true)} onBooks={() => setBookPickerVisible(true)} onAdd={() => setExpenseVisible(true)} onExpensePress={openExpense} />
      {drawerVisible && <Drawer sessionName={session?.user.name} onClose={() => setDrawerVisible(false)} onAuth={() => { setDrawerVisible(false); setAuthVisible(true); }} onBalance={() => { setDrawerVisible(false); setBalanceVisible(true); }} onCheckUpdate={handleCheckUpdate} />}
      {bookPickerVisible && <BookPicker book={serverBook} onClose={() => setBookPickerVisible(false)} onManage={() => { setBookPickerVisible(false); setBookManagerVisible(true); }} />}
      {bookManagerVisible && <BookManagerModal session={session} book={serverBook} onClose={() => setBookManagerVisible(false)} onAuth={() => { setBookManagerVisible(false); setAuthVisible(true); }} onBookChange={handleBookChange} />}
      {expenseVisible && <ExpenseSheet onClose={() => setExpenseVisible(false)} onSave={saveExpense} />}
      {balanceVisible && <BalanceModal session={session} book={serverBook} expenses={sortedExpenses} onClose={() => setBalanceVisible(false)} onSettled={refreshRemoteBook} />}
      {selectedExpense && expenseActionVisible && <ExpenseActionModal expense={selectedExpense} onClose={() => { setExpenseActionVisible(false); setSelectedExpense(null); }} onEdit={() => { setExpenseActionVisible(false); setExpenseEditVisible(true); }} onDelete={() => deleteExpense(selectedExpense)} />}
      {selectedExpense && expenseEditVisible && <ExpenseEditModal expense={selectedExpense} onClose={() => { setExpenseEditVisible(false); setSelectedExpense(null); }} onSave={updateExpense} />}
      {authVisible && <AuthModal onClose={() => setAuthVisible(false)} onSuccess={handleAuthSuccess} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { minHeight: 68, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 32, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pageTitle: { color: colors.ink, fontSize: 27, fontWeight: '700', letterSpacing: -0.5 },
  headerActions: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  searchButton: { width: 52, height: 49, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  bookButton: { height: 49, maxWidth: 170, paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 7, ...shadow.card },
  bookButtonText: { color: colors.secondaryInk, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  homeContent: { paddingHorizontal: 18, paddingBottom: 128 },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radii.large, overflow: 'hidden', ...shadow.card },
  summaryHeader: { paddingHorizontal: 24, paddingTop: 21, flexDirection: 'row', alignItems: 'center', gap: 14 },
  monthSelect: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  monthText: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  statsButton: { backgroundColor: colors.primaryPale, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, flexDirection: 'row', gap: 4, alignItems: 'center' },
  statsButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  monthExpenseBlock: { paddingHorizontal: 24, paddingTop: 22, flexDirection: 'row', alignItems: 'center', gap: 9 },
  labelWithLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  labelLine: { width: 4, height: 24, borderRadius: 5 },
  summaryLabel: { color: colors.secondaryInk, fontSize: 17 },
  totalAmount: { color: colors.ink, fontSize: 38, lineHeight: 47, fontWeight: '700', letterSpacing: -0.7, flexShrink: 1 },
  summaryBottom: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 18, flexDirection: 'row', alignItems: 'flex-end', gap: 28 },
  smallSummaryLabel: { color: colors.secondaryInk, fontSize: 14 },
  smallAmount: { color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 6 },
  budgetRing: { marginLeft: 'auto', width: 116, height: 116, borderRadius: 58, borderWidth: 9, borderColor: '#E8E8EA', alignItems: 'center', justifyContent: 'center' },
  budgetTitle: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  budgetSub: { color: colors.muted, fontSize: 11, marginTop: 4 },
  budgetArrow: { color: colors.primary, fontSize: 24, lineHeight: 25, fontWeight: '800' },
  coupleBar: { backgroundColor: colors.lilac, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  couplePerson: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: { backgroundColor: '#F8F8FC', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  coupleName: { backgroundColor: colors.surface, color: colors.secondaryInk, fontSize: 12, paddingHorizontal: 6, paddingVertical: 4, borderRadius: radii.pill, flexShrink: 1 },
  coupleAmount: { color: '#2458C8', fontSize: 16, fontWeight: '700', flexShrink: 0, letterSpacing: -0.2 },
  coupleDivider: { width: 1, height: 23, backgroundColor: '#A9BDEB' },
  sectionHeading: { marginTop: 27, marginBottom: 13, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionTitle: { color: colors.ink, fontSize: 23, fontWeight: '700' },
  exportButton: { marginLeft: 'auto', width: 45, height: 45, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  listCard: { backgroundColor: colors.surface, borderRadius: radii.large, paddingHorizontal: 20, paddingTop: 22, ...shadow.card },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dateTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  dateWeekday: { color: colors.muted, fontSize: 15, fontWeight: '500' },
  dateTotal: { color: colors.muted, fontSize: 14 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', minHeight: 92, gap: 13 },
  categoryIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 25 },
  expenseInfo: { flex: 1, minWidth: 0 },
  expenseTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  expenseMeta: { color: colors.muted, fontSize: 13, marginTop: 5 },
  expenseTags: { flexDirection: 'row', gap: 5, marginTop: 8 },
  pill: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '600' },
  expenseAmount: { color: colors.primary, fontSize: 18, fontWeight: '700', alignSelf: 'flex-start', marginTop: 4 },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: 61 },
  expenseActionCard: { width: '84%', backgroundColor: colors.surface, borderRadius: 25, padding: 22, alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto', alignItems: 'center', ...shadow.card },
  expenseActionIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.primaryPale, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  expenseActionTitle: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  expenseActionAmount: { color: colors.primary, fontSize: 28, fontWeight: '800', marginTop: 6 },
  expenseActionMeta: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  expenseActionButtons: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 22 },
  expenseActionButton: { flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.primaryPale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  expenseDeleteButton: { backgroundColor: '#FFF0F0' },
  expenseActionButtonText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  expenseCancelButton: { height: 45, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  expenseCancelText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  quickBarWrap: { position: 'absolute', left: 19, right: 19, bottom: 13 },
  quickBar: { height: 58, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 30, borderWidth: 1, borderColor: '#DCE0E9', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, ...shadow.card },
  quickAvatar: { fontSize: 26, marginRight: 10 },
  quickPlaceholder: { color: colors.faint, fontSize: 17, flex: 1 },
  quickIconButton: { width: 38, height: 46, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-start' },
  drawer: { backgroundColor: colors.background, borderTopRightRadius: 30, borderBottomRightRadius: 30, flex: 1 },
  drawerContent: { paddingHorizontal: 18, paddingTop: 55, paddingBottom: 28 },
  profileHeader: { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 22 },
  profileName: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  profileSub: { color: colors.muted, fontSize: 12, marginTop: 4 },
  healthCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 20, flexDirection: 'row', ...shadow.card },
  healthCopy: { flex: 1 },
  healthTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  healthScoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 },
  healthScore: { color: colors.ink, fontSize: 52, lineHeight: 60, fontWeight: '800' },
  healthUnit: { color: colors.ink, fontSize: 16, fontWeight: '700', marginLeft: 8 },
  healthDescription: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingRight: 4 },
  radar: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '11deg' }] },
  radarText: { color: colors.primary, fontSize: 34 },
  drawerStats: { backgroundColor: '#F0F0F2', marginHorizontal: 0, paddingVertical: 13, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, flexDirection: 'row', justifyContent: 'space-around', marginBottom: 25 },
  drawerStatValue: { color: colors.ink, textAlign: 'center', fontSize: 22, fontWeight: '800' },
  drawerStatLabel: { color: colors.muted, textAlign: 'center', fontSize: 14, marginTop: 4 },
  drawerSectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginBottom: 18, marginTop: 2 },
  featureGrid: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 16, flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24 },
  featureItem: { width: '25%', alignItems: 'center', gap: 7, paddingVertical: 11 },
  featureLabel: { color: colors.secondaryInk, fontSize: 13, textAlign: 'center' },
  quickGrid: { backgroundColor: colors.surface, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 18, marginBottom: 22 },
  quickAction: { alignItems: 'center', gap: 8, minWidth: 82 },
  quickActionLabel: { color: colors.secondaryInk, fontSize: 13 },
  drawerLinks: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 18 },
  drawerLink: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  drawerLinkText: { color: colors.secondaryInk, fontSize: 16, flex: 1 },
  bookPicker: { width: '87%', backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 25, paddingVertical: 18, paddingHorizontal: 18, marginTop: 162, alignSelf: 'flex-end', marginRight: 14, ...shadow.card },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 9 },
  pickerTitle: { color: colors.secondaryInk, fontSize: 18, fontWeight: '600' },
  bookOption: { height: 56, backgroundColor: '#F5F6FA', borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 8 },
  bookEmoji: { fontSize: 22 },
  bookOptionText: { color: colors.ink, fontSize: 16, fontWeight: '700', flex: 1 },
  tinyAvatars: { flexDirection: 'row' },
  addBookButton: { height: 55, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  addBookText: { color: colors.muted, fontSize: 17 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  expenseSheet: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%', paddingHorizontal: 15, paddingTop: 9 },
  sheetHandle: { width: 48, height: 5, borderRadius: 5, backgroundColor: '#D4D7DE', alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, marginBottom: 19 },
  sheetTabs: { flexDirection: 'row', gap: 28, alignItems: 'center', flex: 1 },
  activeSheetTab: { color: colors.primary, fontSize: 18, fontWeight: '800', backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill },
  inactiveSheetTab: { color: colors.secondaryInk, fontSize: 18 },
  aiButton: { borderWidth: 1, borderColor: '#CFD4DF', borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 8 },
  aiButtonText: { color: colors.secondaryInk, fontSize: 14, fontWeight: '700' },
  closeButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#CFD4DF', alignItems: 'center', justifyContent: 'center', marginLeft: 9 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16, paddingHorizontal: 9 },
  categoryItem: { width: '19%', alignItems: 'center', gap: 6 },
  categoryLargeIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  categorySelected: { borderColor: colors.primary },
  categoryLargeEmoji: { fontSize: 31 },
  categoryLabel: { color: colors.secondaryInk, fontSize: 12, textAlign: 'center' },
  filterChips: { gap: 8, paddingHorizontal: 9, paddingVertical: 18 },
  filterChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#D8DCE6', borderRadius: 11, height: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeFilterChip: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  filterChipText: { color: colors.secondaryInk, fontSize: 13 },
  amountCard: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  amountDisplay: { color: colors.primary, fontSize: 39, fontWeight: '800', letterSpacing: -1 },
  currencyText: { color: colors.muted, fontSize: 15, marginLeft: 5 },
  amountDivider: { height: 1, backgroundColor: colors.border, marginTop: 11 },
  noteRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 17 },
  noteInput: { color: colors.ink, fontSize: 15, flex: 1 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 5, paddingVertical: 12 },
  splitLabel: { color: colors.muted, fontSize: 13, marginRight: 3 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 0 },
  key: { width: '23.8%', height: 64, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  keyText: { color: colors.secondaryInk, fontSize: 25, fontWeight: '600' },
  doneKey: { backgroundColor: '#82A4F3' },
  doneKeyText: { color: colors.surface, fontWeight: '800' },
  repeatKey: { backgroundColor: colors.primaryPale },
  repeatKeyText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  authScreen: { flex: 1, backgroundColor: colors.background },
  authHeader: { height: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  authBody: { paddingHorizontal: 28, paddingTop: 80 },
  authBrand: { color: colors.ink, fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  authIntro: { color: colors.muted, fontSize: 16, lineHeight: 25, marginTop: 12, marginBottom: 35 },
  authInput: { height: 56, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 18, color: colors.ink, fontSize: 16, marginBottom: 13 },
  authSubmit: { height: 56, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  authSubmitText: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  authMessage: { color: colors.green, textAlign: 'center', marginTop: 15 },
  authToggle: { color: colors.primary, textAlign: 'center', fontSize: 15, fontWeight: '700', marginTop: 24 },
  manageScreen: { flex: 1, backgroundColor: colors.background },
  manageBody: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 42 },
  manageEmpty: { flex: 1, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center' },
  manageEmoji: { fontSize: 56, marginBottom: 18 },
  manageTitle: { color: colors.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  manageDescription: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12, marginBottom: 20 },
  currentBookCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 20, ...shadow.card },
  manageEyebrow: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  currentBookName: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 7 },
  inviteHint: { color: colors.primary, backgroundColor: colors.primaryPale, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, lineHeight: 19, marginTop: 14 },
  memberList: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 },
  memberRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  memberEmail: { color: colors.muted, fontSize: 12, marginTop: 3, flexShrink: 1 },
  manageSectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 25, marginBottom: 11 },
  secondarySubmit: { height: 54, borderRadius: 17, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryPale, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondarySubmitText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  manageMessage: { color: colors.green, textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 16 },
  editCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editSplitText: { color: colors.secondaryInk, fontSize: 15, marginTop: 4 },
  editNoteInput: { minHeight: 92, paddingTop: 16, textAlignVertical: 'top' },
  balanceHero: { backgroundColor: colors.primary, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 24, ...shadow.card },
  balanceAmount: { color: colors.surface, fontSize: 40, fontWeight: '800', marginTop: 8, letterSpacing: -1 },
  balanceDescription: { color: 'rgba(255,255,255,0.82)', fontSize: 14, marginTop: 5 },
  balanceRows: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 16, marginTop: 16, ...shadow.card },
  balanceRow: { minHeight: 75, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  balanceNet: { fontSize: 17, fontWeight: '800' },
});
