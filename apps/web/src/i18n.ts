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
  | 'bank.pieceColor'
  | 'bank.toggleTimer'
  | 'bank.timerOn'
  | 'bank.timerOff'
  | 'bank.cash'
  | 'bank.connected'
  | 'bank.turnNumber'
  | 'bank.currentPlayer'
  | 'bank.pendingAction'
  | 'bank.none'
  | 'bank.controls'
  | 'bank.auctionTile'
  | 'bank.bidAmount'
  | 'bank.sceneAdvanced'
  | 'bank.mortgageTileId'
  | 'bank.houseTileId'
  | 'bank.mortgage'
  | 'bank.redeem'
  | 'bank.buyHouse'
  | 'bank.sellHouse'
  | 'bank.tradeTo'
  | 'bank.cashFromMe'
  | 'bank.cashToMe'
  | 'bank.proposeTrade'
  | 'bank.tileDetails'
  | 'bank.owner'
  | 'bank.unowned'
  | 'bank.group'
  | 'bank.noGroup'
  | 'bank.tileKind'
  | 'bank.players'
  | 'bank.position'
  | 'bank.assets'
  | 'bank.bankrupt'
  | 'bank.active'
  | 'bank.tradeOfferFrom'
  | 'bank.accept'
  | 'bank.reject'
  | 'bank.events'
  | 'bank.hostTools'
  | 'bank.pause'
  | 'bank.resume'
  | 'bank.skipTurn'
  | 'bank.kickPlayer'
  | 'bank.scorePlayer'
  | 'bank.scoreDelta'
  | 'bank.adjustCash'
  | 'bank.loading3d'
  | 'bank.sceneUnavailable'
  | 'bank.sceneUnavailableDetail'
  | 'bank.onboardingTitle'
  | 'bank.onboardingHint'
  | 'bank.enterToJoin'
  | 'bank.inviteLink'
  | 'bank.copyLink'
  | 'bank.linkCopied'
  | 'bank.waitingForPlayers'
  | 'bank.playersInLobby'
  | 'bank.dice'
  | 'bank.backToGames'
  | 'bank.resetCamera'
  | 'bank.cameraHint';

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
    'bank.rulePreset': 'نظام القواعد',
    'bank.official': 'رسمي',
    'bank.house': 'قواعد البيت',
    'bank.rollDice': 'ارمي الزهر',
    'bank.endTurn': 'خلص دورك',
    'bank.buy': 'اشتري',
    'bank.auction': 'مزاد',
    'bank.closeAuction': 'قفل المزاد',
    'bank.startGame': 'ابدأ اللعب',
    'bank.pieceColor': 'لون القطعة',
    'bank.toggleTimer': 'تايمر الدور',
    'bank.timerOn': 'شغال',
    'bank.timerOff': 'مطفي',
    'bank.cash': 'الفلوس',
    'bank.connected': 'متصل',
    'bank.turnNumber': 'رقم الدور',
    'bank.currentPlayer': 'اللعيب الحالي',
    'bank.pendingAction': 'المطلوب دلوقتي',
    'bank.none': 'مفيش',
    'bank.controls': 'التحكم',
    'bank.auctionTile': 'مربع المزاد',
    'bank.bidAmount': 'قيمة المزايدة',
    'bank.sceneAdvanced': 'إجراءات متقدمة',
    'bank.mortgageTileId': 'رقم مربع الرهن',
    'bank.houseTileId': 'رقم مربع البيوت',
    'bank.mortgage': 'رهن',
    'bank.redeem': 'فك رهن',
    'bank.buyHouse': 'اشتري بيت',
    'bank.sellHouse': 'بيع بيت',
    'bank.tradeTo': 'بدّل مع',
    'bank.cashFromMe': 'فلوس مني',
    'bank.cashToMe': 'فلوس ليا',
    'bank.proposeTrade': 'ابعت عرض تبديل',
    'bank.tileDetails': 'تفاصيل المربع',
    'bank.owner': 'المالك',
    'bank.unowned': 'من غير مالك',
    'bank.group': 'المجموعة',
    'bank.noGroup': 'مفيش',
    'bank.tileKind': 'نوع المربع',
    'bank.players': 'اللاعيبة',
    'bank.position': 'المكان',
    'bank.assets': 'الممتلكات',
    'bank.bankrupt': 'مفلس',
    'bank.active': 'لسه في اللعب',
    'bank.tradeOfferFrom': 'عرض تبديل من',
    'bank.accept': 'موافق',
    'bank.reject': 'رفض',
    'bank.events': 'سجل الأحداث',
    'bank.hostTools': 'أدوات الهوست',
    'bank.pause': 'إيقاف مؤقت',
    'bank.resume': 'كمل',
    'bank.skipTurn': 'عدّي الدور',
    'bank.kickPlayer': 'اطرد لاعب',
    'bank.scorePlayer': 'عدّل فلوس لاعب',
    'bank.scoreDelta': 'فرق الفلوس',
    'bank.adjustCash': 'نفّذ التعديل',
    'bank.loading3d': 'بنحمّل البورد الـ3D...',
    'bank.sceneUnavailable': 'رجعنا للنسخة العادية عشان WebGL مش متاح.',
    'bank.sceneUnavailableDetail': 'المتصفح عندك مش بيدعم WebGL أو مقفول، فشغلنا الواجهة العادية تلقائي.',
    'bank.onboardingTitle': 'ادخل اللوبي',
    'bank.onboardingHint': 'اختار اسمك ولون القطعة بتاعتك وبعدين ادخل.',
    'bank.enterToJoin': 'ادخل الأوضة',
    'bank.inviteLink': 'لينك الدعوة',
    'bank.copyLink': 'انسخ اللينك',
    'bank.linkCopied': 'اتنسخ اللينك',
    'bank.waitingForPlayers': 'مستنيين باقي اللاعيبة',
    'bank.playersInLobby': 'عدد اللاعيبة في اللوبي',
    'bank.dice': 'الزهر',
    'bank.backToGames': 'رجوع للألعاب',
    'bank.resetCamera': 'رجّع الكاميرا',
    'bank.cameraHint': 'اسحب للاتجاهات وكبّر بالماوس/البنش',
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
    'bank.pieceColor': 'Piece Color',
    'bank.toggleTimer': 'Turn Timer',
    'bank.timerOn': 'On',
    'bank.timerOff': 'Off',
    'bank.cash': 'Cash',
    'bank.connected': 'Connected',
    'bank.turnNumber': 'Turn',
    'bank.currentPlayer': 'Current Player',
    'bank.pendingAction': 'Pending',
    'bank.none': 'None',
    'bank.controls': 'Controls',
    'bank.auctionTile': 'Auction Tile',
    'bank.bidAmount': 'Bid Amount',
    'bank.sceneAdvanced': 'Advanced Actions',
    'bank.mortgageTileId': 'Mortgage Tile ID',
    'bank.houseTileId': 'House Tile ID',
    'bank.mortgage': 'Mortgage',
    'bank.redeem': 'Redeem',
    'bank.buyHouse': 'Buy House',
    'bank.sellHouse': 'Sell House',
    'bank.tradeTo': 'Trade To',
    'bank.cashFromMe': 'Cash From Me',
    'bank.cashToMe': 'Cash To Me',
    'bank.proposeTrade': 'Propose Trade',
    'bank.tileDetails': 'Tile Details',
    'bank.owner': 'Owner',
    'bank.unowned': 'Unowned',
    'bank.group': 'Group',
    'bank.noGroup': 'N/A',
    'bank.tileKind': 'Tile Kind',
    'bank.players': 'Players',
    'bank.position': 'Position',
    'bank.assets': 'Assets',
    'bank.bankrupt': 'Bankrupt',
    'bank.active': 'Active',
    'bank.tradeOfferFrom': 'Trade offer from',
    'bank.accept': 'Accept',
    'bank.reject': 'Reject',
    'bank.events': 'Live Events',
    'bank.hostTools': 'Host Tools',
    'bank.pause': 'Pause',
    'bank.resume': 'Resume',
    'bank.skipTurn': 'Skip Turn',
    'bank.kickPlayer': 'Kick Player',
    'bank.scorePlayer': 'Adjust Player Cash',
    'bank.scoreDelta': 'Cash Delta',
    'bank.adjustCash': 'Apply Adjustment',
    'bank.loading3d': 'Loading 3D board...',
    'bank.sceneUnavailable': 'Classic UI is active because WebGL is unavailable.',
    'bank.sceneUnavailableDetail': 'WebGL is not available or disabled in this browser. Falling back to classic board view.',
    'bank.onboardingTitle': 'Join Lobby',
    'bank.onboardingHint': 'Choose your name and piece color to join this room.',
    'bank.enterToJoin': 'Enter Room',
    'bank.inviteLink': 'Invite Link',
    'bank.copyLink': 'Copy Link',
    'bank.linkCopied': 'Link copied',
    'bank.waitingForPlayers': 'Waiting for players to join',
    'bank.playersInLobby': 'Players in lobby',
    'bank.dice': 'Dice',
    'bank.backToGames': 'Back to games',
    'bank.resetCamera': 'Reset Camera',
    'bank.cameraHint': 'Drag to move and wheel/pinch to zoom',
  },
};

export function t(language: Language, key: TranslationKey): string {
  return messages[language][key] ?? key;
}
