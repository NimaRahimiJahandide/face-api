interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
}

interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

interface Window {
  Telegram?: TelegramNamespace;
}
