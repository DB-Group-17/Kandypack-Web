'use client';

/**
 * @file AddProductModal.tsx
 * @description Accessible modal dialog for creating a new product catalog item.
 * Collects SKU, Product name, Category, Unit of measure, Unit price, and Space consumption rate.
 * Conforms to Docs/07_content-copy.md §372 ("A product with this SKU already exists.").
 */

import React, { useState } from 'react';
import { NewProductPayload, ProductItem } from '../types';

interface AddProductModalProps {
  /** Whether the modal dialog is currently visible */
  isOpen: boolean;
  /** Existing products to check for duplicate SKU validation */
  existingProducts: ProductItem[];
  /** Callback when the modal is dismissed */
  onClose: () => void;
  /** Callback when valid product payload is submitted */
  onSubmit: (payload: NewProductPayload) => void;
}

const CATEGORY_OPTIONS = [
  'Food',
  'Household',
  'Personal Care',
  'Beverages',
  'Logistics Equipment',
  'Cold Chain',
  'Raw Materials',
  'Packaging',
];

const UNIT_OPTIONS = ['box', 'bottle', 'pack', 'bag', 'tube', 'crate', 'case', 'unit'];

/**
 * AddProductModal Component
 */
export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  existingProducts,
  onClose,
  onSubmit,
}) => {
  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [unitOfMeasure, setUnitOfMeasure] = useState(UNIT_OPTIONS[0]);
  const [unitPrice, setUnitPrice] = useState('');
  const [spaceRate, setSpaceRate] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  /**
   * Validates form inputs and checks for SKU uniqueness before submitting.
   *
   * @param e Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedSku = sku.trim();
    const trimmedName = productName.trim();
    const parsedPrice = parseFloat(unitPrice);
    const parsedSpace = parseFloat(spaceRate);

    // Basic required field validation
    if (!trimmedSku || !trimmedName || isNaN(parsedPrice) || isNaN(parsedSpace)) {
      setErrorMessage('Please fill in all required fields with valid values.');
      return;
    }

    // SKU duplication check per Docs/07_content-copy.md §373
    const isDuplicateSku = existingProducts.some(
      (p) => p.sku.toLowerCase() === trimmedSku.toLowerCase()
    );
    if (isDuplicateSku) {
      setErrorMessage('A product with this SKU already exists.');
      return;
    }

    if (parsedPrice < 0) {
      setErrorMessage('Unit price cannot be negative.');
      return;
    }

    if (parsedSpace <= 0) {
      setErrorMessage('Space consumption rate must be greater than zero.');
      return;
    }

    onSubmit({
      sku: trimmedSku,
      product_name: trimmedName,
      category,
      unit_of_measure: unitOfMeasure,
      unit_price: parsedPrice,
      space_rate: parsedSpace,
    });

    // Reset and close
    setSku('');
    setProductName('');
    setUnitPrice('');
    setSpaceRate('');
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/30 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#C8C4D7]/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBE9FE] text-[#4132C7] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#121C2C]">Add Product</h3>
              <p className="text-[12px] text-[#474554]">
                Register a new inventory product to master data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C]"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl flex items-center gap-2 text-[13px] text-[#F93C65]">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SKU */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                SKU <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. PRD-8915"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
              Product Name <span className="text-[#F93C65]">*</span>
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Ceylon Black Tea 500g Pack"
              required
              className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Unit of measure */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Unit
              </label>
              <select
                value={unitOfMeasure}
                onChange={(e) => setUnitOfMeasure(e.target.value)}
                className="w-full h-11 px-3 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit Price */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Unit Price (Rs.) <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="450.00"
                required
                className="w-full h-11 px-3 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Space Rate */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Space Rate (m³) <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={spaceRate}
                onChange={(e) => setSpaceRate(e.target.value)}
                placeholder="0.50"
                required
                className="w-full h-11 px-3 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#C8C4D7]/20 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-[#C8C4D7] text-[#474554] font-semibold text-[13px] hover:bg-[#F5F5FA] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white font-semibold text-[13px] hover:bg-[#3527a8] transition-colors shadow-sm"
            >
              + Add Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
