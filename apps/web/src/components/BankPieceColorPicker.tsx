import { PIECE_COLORS, type Language, type PieceColor } from '@ags/shared';
import { useLanguage } from './LanguageProvider';

interface BankPieceColorPickerProps {
  value: PieceColor;
  onChange: (color: PieceColor) => void;
  disabled?: boolean;
  label?: string;
  unavailableColors?: PieceColor[];
}

const COLOR_HEX: Record<PieceColor, string> = {
  red: '#ff4d6d',
  blue: '#38bdf8',
  green: '#22c55e',
  yellow: '#facc15',
  purple: '#c084fc',
  orange: '#fb923c',
  teal: '#2dd4bf',
  pink: '#f472b6',
};

const COLOR_LABELS: Record<Language, Record<PieceColor, string>> = {
  en: {
    red: 'Red',
    blue: 'Blue',
    green: 'Green',
    yellow: 'Yellow',
    purple: 'Purple',
    orange: 'Orange',
    teal: 'Teal',
    pink: 'Pink',
  },
  ar: {
    red: 'أحمر',
    blue: 'أزرق',
    green: 'أخضر',
    yellow: 'أصفر',
    purple: 'بنفسجي',
    orange: 'برتقالي',
    teal: 'تركواز',
    pink: 'وردي',
  },
};

export function BankPieceColorPicker({
  value,
  onChange,
  disabled = false,
  label,
  unavailableColors = [],
}: BankPieceColorPickerProps): JSX.Element {
  const { language, tr } = useLanguage();
  const unavailable = new Set(unavailableColors);

  return (
    <label className="bank-field">
      <span className="bank-label">{label ?? tr('bank.pieceColor')}</span>
      <div className="bank-color-grid">
        {PIECE_COLORS.map((color) => {
          const isTaken = unavailable.has(color);
          return (
            <button
              key={color}
              type="button"
              className={`bank-color-chip${value === color ? ' active' : ''}${isTaken ? ' taken' : ''}`}
              onClick={() => onChange(color)}
              disabled={disabled || isTaken}
              aria-pressed={value === color}
              aria-label={COLOR_LABELS[language][color]}
            >
              <span className="bank-color-dot" style={{ backgroundColor: COLOR_HEX[color] }} />
              <span>{COLOR_LABELS[language][color]}</span>
            </button>
          );
        })}
      </div>
    </label>
  );
}
