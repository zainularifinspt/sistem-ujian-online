"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MathContent } from "@/components/math-content";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

type FormulaItem = {
  label: string;
  latex: string;
  preview: string;
  description: string;
};

type Category = {
  name: string;
  items: FormulaItem[];
};

const FORMULA_CATEGORIES: Category[] = [
  {
    name: "Dasar & Pecahan",
    items: [
      { label: "Rumus $...$", latex: "$x$", preview: "$x$", description: "Format rumus inline" },
      { label: "Pangkat", latex: "$x^{2}$", preview: "$x^{2}$", description: "Pangkat / Eksponen" },
      { label: "Indeks", latex: "$x_{1}$", preview: "$x_{1}$", description: "Subskrip / Indeks" },
      { label: "Pecahan", latex: "$\\frac{a}{b}$", preview: "$\\frac{a}{b}$", description: "Pecahan pembilang/penyebut" },
      { label: "Akar Kuadrat", latex: "$\\sqrt{x}$", preview: "$\\sqrt{x}$", description: "Akar kuadrat" },
      { label: "Akar n", latex: "$\\sqrt[n]{x}$", preview: "$\\sqrt[n]{x}$", description: "Akar pangkat n" },
      { label: "Plus Minus", latex: "$\\pm$", preview: "$\\pm$", description: "Tanda plus minus" },
      { label: "Kali", latex: "$\\times$", preview: "$\\times$", description: "Simbol perkalian" },
      { label: "Bagi", latex: "$\\div$", preview: "$\\div$", description: "Simbol pembagian" },
      { label: "Titik Kali", latex: "$\\cdot$", preview: "$\\cdot$", description: "Titik perkalian" }
    ]
  },
  {
    name: "Pertidaksamaan & Simbol",
    items: [
      { label: "Kurang dari sama", latex: "$\\le$", preview: "$\\le$", description: "Kurang dari sama dengan (<=)" },
      { label: "Lebih dari sama", latex: "$\\ge$", preview: "$\\ge$", description: "Lebih dari sama dengan (>=)" },
      { label: "Tidak sama", latex: "$\\neq$", preview: "$\\neq$", description: "Tidak sama dengan (!=)" },
      { label: "Mendekati", latex: "$\\approx$", preview: "$\\approx$", description: "Kira-kira / mendekati" },
      { label: "Tak hingga", latex: "$\\infty$", preview: "$\\infty$", description: "Tak terhingga" },
      { label: "Derajat", latex: "$^{\\circ}$", preview: "$90^{\\circ}$", description: "Simbol derajat sudut / suhu" },
      { label: "Segitiga/Delta", latex: "$\\Delta$", preview: "$\\Delta$", description: "Delta / diskriminan" },
      { label: "Anggota", latex: "$\\in$", preview: "$\\in$", description: "Elemen himpunan" }
    ]
  },
  {
    name: "Huruf Yunani",
    items: [
      { label: "Pi", latex: "$\\pi$", preview: "$\\pi$", description: "Konstanta pi" },
      { label: "Alpha", latex: "$\\alpha$", preview: "$\\alpha$", description: "Sudut alpha" },
      { label: "Beta", latex: "$\\beta$", preview: "$\\beta$", description: "Sudut beta" },
      { label: "Gamma", latex: "$\\gamma$", preview: "$\\gamma$", description: "Gamma" },
      { label: "Theta", latex: "$\\theta$", preview: "$\\theta$", description: "Sudut theta" },
      { label: "Lambda", latex: "$\\lambda$", preview: "$\\lambda$", description: "Panjang gelombang / lambda" },
      { label: "Mu", latex: "$\\mu$", preview: "$\\mu$", description: "Mikro / mu" },
      { label: "Sigma", latex: "$\\sigma$", preview: "$\\sigma$", description: "Standar deviasi / sigma" },
      { label: "Omega", latex: "$\\omega$", preview: "$\\omega$", description: "Kecepatan sudut / omega" }
    ]
  },
  {
    name: "Kalkulus & Fungsi",
    items: [
      { label: "Integral", latex: "$\\int_{a}^{b} f(x)\\,dx$", preview: "$\\int_{a}^{b} f(x)\\,dx$", description: "Integral tentu" },
      { label: "Sigma/Jumlah", latex: "$\\sum_{i=1}^{n} x_i$", preview: "$\\sum_{i=1}^{n} x_i$", description: "Notasi Sigma / Sum" },
      { label: "Limit", latex: "$\\lim_{x \\to 0}$", preview: "$\\lim_{x \\to 0}$", description: "Notasi limit" },
      { label: "Vektor", latex: "$\\vec{v}$", preview: "$\\vec{v}$", description: "Notasi vektor" },
      { label: "Logaritma", latex: "$\\log_{a}(b)$", preview: "$\\log_{a}(b)$", description: "Logaritma basis a" },
      { label: "Ln", latex: "$\\ln(x)$", preview: "$\\ln(x)$", description: "Logaritma natural" },
      { label: "Sinus", latex: "$\\sin(\\theta)$", preview: "$\\sin(\\theta)$", description: "Fungsi sinus" },
      { label: "Cosinus", latex: "$\\cos(\\theta)$", preview: "$\\cos(\\theta)$", description: "Fungsi cosinus" },
      { label: "Tangen", latex: "$\\tan(\\theta)$", preview: "$\\tan(\\theta)$", description: "Fungsi tangen" }
    ]
  }
];

type MathFormulaToolbarProps = {
  onInsert: (latex: string) => void;
  className?: string;
};

export function MathFormulaToolbar({
  onInsert,
  className = ""
}: MathFormulaToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  // Common quick items always visible for instant 1-click insert
  const quickItems: FormulaItem[] = [
    { label: "x²", latex: "$x^2$", preview: "$x^2$", description: "Pangkat" },
    { label: "x₁", latex: "$x_1$", preview: "$x_1$", description: "Indeks" },
    { label: "a/b", latex: "$\\frac{a}{b}$", preview: "$\\frac{a}{b}$", description: "Pecahan" },
    { label: "√x", latex: "$\\sqrt{x}$", preview: "$\\sqrt{x}$", description: "Akar" },
    { label: "±", latex: "$\\pm$", preview: "$\\pm$", description: "Plus Minus" },
    { label: "≤", latex: "$\\le$", preview: "$\\le$", description: "Kurang dari sama" },
    { label: "≥", latex: "$\\ge$", preview: "$\\ge$", description: "Lebih dari sama" },
    { label: "≠", latex: "$\\neq$", preview: "$\\neq$", description: "Tidak sama dengan" },
    { label: "π", latex: "$\\pi$", preview: "$\\pi$", description: "Pi" },
    { label: "°", latex: "$^{\\circ}$", preview: "$90^{\\circ}$", description: "Derajat" }
  ];

  return (
    <div className={`rounded-xl border border-sky-200/80 bg-sky-50/50 p-2 text-xs ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="flex items-center gap-1 font-bold text-sky-900 pr-1">
            <Sparkles className="h-3.5 w-3.5 text-sky-600" />
            <span className="hidden sm:inline">Simbol Cepat:</span>
          </span>
          {quickItems.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.description}
              onClick={() => onInsert(item.latex)}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-400 hover:bg-sky-100/70 active:scale-95"
            >
              <MathContent text={item.preview} />
            </button>
          ))}
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setIsOpen(!isOpen)}
          className="h-7 gap-1 px-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 hover:text-sky-900"
        >
          {isOpen ? (
            <>
              Tutup Katalog <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Katalog Lengkap <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>

      {isOpen && (
        <div className="mt-2.5 rounded-lg border border-sky-200 bg-white p-2.5 shadow-sm">
          <div className="mb-2 flex flex-wrap gap-1 border-b pb-2">
            {FORMULA_CATEGORIES.map((cat, idx) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(idx)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                  activeCategory === idx
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {FORMULA_CATEGORIES[activeCategory].items.map((item) => (
              <button
                key={item.label}
                type="button"
                title={`${item.description} (${item.latex})`}
                onClick={() => onInsert(item.latex)}
                className="flex items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-1.5 text-left transition hover:border-sky-400 hover:bg-sky-50 active:scale-95"
              >
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-medium text-slate-500">
                    {item.label}
                  </div>
                  <div className="truncate font-serif text-sm font-bold text-slate-900">
                    <MathContent text={item.preview} />
                  </div>
                </div>
                <span className="shrink-0 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-bold text-sky-700">
                  +
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
