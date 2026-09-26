'use client';

/**
 * @file EditProductModal.tsx
 * @description Accessible modal dialog for modifying an existing product catalog specification.
 * Supports updating product name, category, unit of measure, unit price, and space consumption rate.
 * The SKU remains read-only as the permanent canonical identifier.
 * Conforms to Docs/05_api-and-pages.md §A3, §384 and DESIGN.md.
 */

import React, { useState } from 'react';
import { ProductItem, UpdateProductPayload } from '../types';

interface EditProductModalProps {
  /** Whether the modal dialog is currently visible */
  isOpen: boolean;
  /** The product item currently being edited */
  product: ProductItem | null;
  /** Callback when the modal is dismissed */
  onClose: () => void;
  /** Callback when valid updated product payload is submitted */
  onSubmit: (productId: number, payload: UpdateProductPayload) => Promise<{ success: boolean; error?: string } | void> | void;
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
 * EditProductModalContent Component
 *
 * Inner form component initialized cleanly with target product attributes.
 */
const EditProductModalContent: React.FC<Omit<EditProductModalProps, 'isOpen'> & { product: ProductItem }> = ({
  product,
  onClose,
  onSubmit,
}) => {
  const [productName, setProductName] = useState(product.product_name);
  const [category, setCategory] = useState(
    CATEGORY_OPTIONS.includes(product.category) ? product.category : CATEGORY_OPTIONS[0]
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState(
    UNIT_OPTIONS.includes(product.unit_of_measure) ? product.unit_of_measure : product.unit_of_measure || UNIT_OPTIONS[0]
  );
  const [unitPrice, setUnitPrice] = useState(String(product.unit_price));
  const [spaceRate, setSpaceRate] = useState(String(product.space_rate));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Validates form inputs and submits updated product payload to backend.
   *
   * @param e Form submit event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = productName.trim();
    const parsedPrice = parseFloat(unitPrice);
    const parsedSpace = parseFloat(spaceRate);

    if (!trimmedName) {
      setErrorMessage('Product name is required.');
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('Unit price must be a valid non-negative number.');
      return;
    }

    if (isNaN(parsedSpace) || parsedSpace <= 0) {
      setErrorMessage('Space consumption rate must be greater than zero.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await onSubmit(product.product_id, {
        product_name: trimmedName,
        category,
        unit_of_measure: unitOfMeasure,
        unit_price: parsedPrice,
        space_rate: parsedSpace,
      });

      if (result && typeof result === 'object' && result.success === false) {
        setErrorMessage(result.error || 'Failed to update product.');
        return;
      }

      onClose();
    } catch (err: unknown) {
      console.error('Error submitting product update:', err);
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to update product. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#121C2C]">Edit Product</h3>
              <p className="text-[12px] text-[#474554]">
                Update specifications for SKU <span className="font-mono font-semibold text-[#4132C7]">{product.sku}</span>
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
            {/* SKU (Read-Only) */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                SKU (Catalog Code)
              </label>
              <input
                type="text"
                value={product.sku}
                disabled
                className="w-full h-11 px-3.5 bg-[#F1F1F5] border border-[#C8C4D7]/40 rounded-lg text-[13px] text-[#777586] font-mono cursor-not-allowed select-none"
              />
              <span className="text-[11px] text-[#777586] mt-1 block">SKU cannot be modified.</span>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Category <span className="text-[#F93C65]">*</span>
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
              placeholder="e.g. Milk Powder 400g"
              required
              className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Unit of Measure */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Unit of Measure
              </label>
              <select
                value={unitOfMeasure}
                onChange={(e) => setUnitOfMeasure(e.target.value)}
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                {UNIT_OPTIONS.map((uom) => (
                  <option key={uom} value={uom}>
                    {uom}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit Price */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Price (LKR) <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="450.00"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Space Rate */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Space (m³) <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.0001"
                value={spaceRate}
                onChange={(e) => setSpaceRate(e.target.value)}
                placeholder="0.25"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
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
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#4132C7] hover:bg-[#3527a8] text-white font-semibold text-[13px] shadow-sm disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isSubmitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * EditProductModal Component
 *
 * Renders the modal dialog when open with target product data.
 */
export const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  product,
  onClose,
  onSubmit,
}) => {
  if (!isOpen || !product) return null;

  return (
    <EditProductModalContent
      key={product.product_id}
      product={product}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};

