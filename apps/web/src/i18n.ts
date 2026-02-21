import type { Language } from '@ags/shared';

export type TranslationKey =
  | 'app.title'
  | 'app.subtitle'
  | 'landing.title'
  | 'landing.description'
  | 'landing.casino'
  | 'landing.bank'
  | 'landing.open'
  | 'common.back'
  | 'common.create'
  | 'common.join'
  | 'common.roomCode'
  | 'common.name'
  | 'common.language'
  | 'common.hostCanPlay'
  | 'common.start'
  | 'common.status'
  | 'common.notConnected'
  | 'casino.title'
  | 'casino.targetScore'
  | 'casino.buzz'
  | 'casino.answer'
  | 'casino.submitAnswer'
  | 'casino.nextRound'
  | 'casino.reveal'
  | 'casino.startGame'
  | 'casino.drawingSubmit'
  | 'casino.vote'
  | 'bank.title'
  | 'bank.rulePreset'
  | 'bank.official'
  | 'bank.house'
  | 'bank.rollDice'
  | 'bank.endTurn'
  | 'bank.buy'
  | 'bank.auction'
  | 'bank.closeAuction'
  | 'bank.startGame'
  | 'bank.toggleTimer'
  | 'bank.timerOn'
  | 'bank.timerOff'
  | 'bank.cash';

const messages: Record<Language, Record<TranslationKey, string>> = {
  ar: {
    'app.title': 'منصة الألعاب المباشرة',
    'app.subtitle': 'كازينو الألعاب + بنك الحظ',
    'landing.title': 'اختر اللعبة',
    'landing.description': 'منصة متعددة اللاعبين في نفس الوقت',
    'landing.casino': 'كازينو الألعاب',
    'landing.bank': 'بنك الحظ',
    'landing.open': 'ابدأ',
    'common.back': 'رجوع',
    'common.create': 'إنشاء غرفة',
    'common.join': 'دخول غرفة',
    'common.roomCode': 'كود الغرفة',
    'common.name': 'الاسم',
    'common.language': 'اللغة',
    'common.hostCanPlay': 'الهوست يشارك كلاعب',
    'common.start': 'ابدأ',
    'common.status': 'الحالة',
    'common.notConnected': 'غير متصل',
    'casino.title': 'كازينو الألعاب',
    'casino.targetScore': 'النقاط المطلوبة للفوز',
    'casino.buzz': 'بازر',
    'casino.answer': 'الإجابة',
    'casino.submitAnswer': 'إرسال الإجابة',
    'casino.nextRound': 'الجولة التالية',
    'casino.reveal': 'كشف الإجابة',
    'casino.startGame': 'بدء اللعبة',
    'casino.drawingSubmit': 'رفع الرسمة',
    'casino.vote': 'تصويت',
    'bank.title': 'بنك الحظ',
    'bank.rulePreset': 'نمط القواعد',
    'bank.official': 'كلاسيكي',
    'bank.house': 'قواعد منزلية',
    'bank.rollDice': 'رمي النرد',
    'bank.endTurn': 'إنهاء الدور',
    'bank.buy': 'شراء',
    'bank.auction': 'مزاد',
    'bank.closeAuction': 'إغلاق المزاد',
    'bank.startGame': 'بدء اللعبة',
    'bank.toggleTimer': 'مؤقت الدور',
    'bank.timerOn': 'تشغيل',
    'bank.timerOff': 'إيقاف',
    'bank.cash': 'الرصيد',
  },
  en: {
    'app.title': 'Live Game Platform',
    'app.subtitle': 'Casino + Bank ElHaz',
    'landing.title': 'Choose a Game',
    'landing.description': 'Multiplayer rooms in real-time',
    'landing.casino': 'Casino ElAl3ab',
    'landing.bank': 'Bank ElHaz',
    'landing.open': 'Open',
    'common.back': 'Back',
    'common.create': 'Create Room',
    'common.join': 'Join Room',
    'common.roomCode': 'Room Code',
    'common.name': 'Name',
    'common.language': 'Language',
    'common.hostCanPlay': 'Host joins as player',
    'common.start': 'Start',
    'common.status': 'Status',
    'common.notConnected': 'Not connected',
    'casino.title': 'Casino ElAl3ab',
    'casino.targetScore': 'Target score',
    'casino.buzz': 'Buzz',
    'casino.answer': 'Answer',
    'casino.submitAnswer': 'Submit Answer',
    'casino.nextRound': 'Next Round',
    'casino.reveal': 'Reveal Answer',
    'casino.startGame': 'Start Game',
    'casino.drawingSubmit': 'Submit Drawing',
    'casino.vote': 'Vote',
    'bank.title': 'Bank ElHaz',
    'bank.rulePreset': 'Rule Preset',
    'bank.official': 'Official',
    'bank.house': 'House Rules',
    'bank.rollDice': 'Roll Dice',
    'bank.endTurn': 'End Turn',
    'bank.buy': 'Buy',
    'bank.auction': 'Auction',
    'bank.closeAuction': 'Close Auction',
    'bank.startGame': 'Start Game',
    'bank.toggleTimer': 'Turn Timer',
    'bank.timerOn': 'On',
    'bank.timerOff': 'Off',
    'bank.cash': 'Cash',
  },
};

export function t(language: Language, key: TranslationKey): string {
  return messages[language][key] ?? key;
}