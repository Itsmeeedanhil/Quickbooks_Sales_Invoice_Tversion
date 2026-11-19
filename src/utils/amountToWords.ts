const UNITS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = [
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const THOUSANDS_GROUPS = ["", " Thousand", " Million", " Billion"];

function convertHundreds(num: number): string {
  let n = num;
  let words = "";

  if (n >= 100) {
    words += UNITS[Math.floor(n / 100)] + " Hundred ";
    n %= 100;
  }

  if (n >= 10 && n <= 19) {
    words += TEENS[n - 10] + " ";
    n = 0;
  }

  if (n >= 20) {
    words += TENS[Math.floor(n / 10)] + " ";
    n %= 10;
  }

  if (n >= 1 && n <= 9) {
    words += UNITS[n] + " ";
  }

  return words;
}

function convertToWords(num: number): string {
  if (num === 0) return "Zero";
  if (num < 0) return "Negative " + convertToWords(Math.abs(num));

  let n = num;
  let words = "";

  for (let i = 0; n > 0; i++) {
    if (n % 1000 !== 0) {
      words = convertHundreds(n % 1000) + THOUSANDS_GROUPS[i] + " " + words;
    }
    n = Math.floor(n / 1000);
  }

  return words.trim();
}

/**
 * Exact port of OtherFunctions.AmountToWordsConverter.Convert(double amount)
 */
export function amountToWords(amount: number): string {
  if (amount === 0 || isNaN(amount)) {
    return "Zero Pesos Only";
  }

  if (amount < 0) {
    return "Negative amount, cannot convert to words";
  }

  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);

  const pesoWords = convertToWords(pesos);
  const centavoWords = convertToWords(centavos);

  if (centavos > 0) {
    return `${pesoWords} Pesos and ${centavoWords} Centavos Only`;
  } else {
    return `${pesoWords} Pesos Only`;
  }
}

export function formatCurrency(value: number): string {
  if (isNaN(value)) return "0.00";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSeriesNumber(series: number): string {
  const safe = Math.max(0, Math.floor(series || 0));
  return String(safe).padStart(6, "0");
}

export function formatDateMMDDYYYY(dateStr: string): string {
  if (!dateStr) return "";
  // If already MM/dd/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatDateLong(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function toInputDateValue(dateStr: string): string {
  if (!dateStr) {
    return new Date().toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts;
    return `${yyyy.slice(0, 4)}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}
