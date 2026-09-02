'use client';

/**
 * @file ProductsTab.tsx
 * @description Tabular catalog view of Products for the Master Data module.
 * Columns: SKU, Product Name, Category, Unit Price, Space Rate, Status, and Actions.
 * Conforms to Docs/07_content-copy.md §369 and UI/master_data/code.html.
 */

import React from 'react';
import { ProductItem } from '../types';

interface ProductsTabProps {
  /** Array of products to display on the current page */
  items: ProductItem[];
  /** Callback to trigger opening the Add Product modal */
  onAddClick: () => void;
  /** Optional callback to edit a product */
  onEditClick?: (item: ProductItem) => void;
}

/**
 * Renders status badge with semantic color tokens.
 *
 * @param status Product operational status
 * @returns JSX Element containing the badge pill
 */
const renderStatusBadge = (status: ProductItem['status']): React.JSX.Element => {
  switch (status) {
    case 'Active':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
          Active
        </span>
      );
    case 'Low Stock':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF9E6] text-[#FFB800]">
          Low Stock
        </span>
      );
    case 'Inactive':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F1F1F5] text-[#474554]">
          Inactive
        </span>
      );
  }
};

/**
 * ProductsTab Component
 */
export const ProductsTab: React.FC<ProductsTabProps> = ({
  items,
  onAddClick,
  onEditClick,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#EBE9FE] text-[#4132C7] mx-auto flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
          No records yet.
        </h3>
        <p className="text-[13px] text-[#474554] max-w-sm mx-auto mb-5">
          No products match your search query or have been registered in the system catalog.
        </p>
        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#3527a8] transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Product</span>
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#F8F9FC] border-b border-[#C8C4D7]/30 text-[11px] font-bold text-[#474554] tracking-wider uppercase">
            <th className="py-3.5 px-5">SKU</th>
            <th className="py-3.5 px-5">Product Name</th>
            <th className="py-3.5 px-5">Category</th>
            <th className="py-3.5 px-5 text-right">Unit Price</th>
            <th className="py-3.5 px-5 text-right">Space Rate</th>
            <th className="py-3.5 px-5 text-center">Status</th>
            <th className="py-3.5 px-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#C8C4D7]/20 text-[13px] text-[#121C2C]">
          {items.map((product) => (
            <tr
              key={product.product_id}
              className="hover:bg-[#F9F9FF] transition-colors group"
            >
              {/* SKU */}
              <td className="py-4 px-5 font-mono text-[12px] font-medium text-[#4132C7]">
                {product.sku}
              </td>

              {/* Product Name with Icon Container */}
              <td className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#EBE9FE]/70 text-[#4132C7] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-[#121C2C]">{product.product_name}</p>
                    <p className="text-[11px] text-[#474554]">
                      Unit: {product.unit_of_measure}
                    </p>
                  </div>
                </div>
              </td>

              {/* Category */}
              <td className="py-4 px-5 text-[#474554]">
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#F1F1F5] text-[12px] font-medium text-[#121C2C]">
                  {product.category}
                </span>
              </td>

              {/* Unit Price */}
              <td className="py-4 px-5 text-right font-medium text-[#121C2C]">
                Rs. {product.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>

              {/* Space Rate */}
              <td className="py-4 px-5 text-right text-[#474554] font-medium">
                {product.space_rate.toFixed(2)} m³
              </td>

              {/* Status */}
              <td className="py-4 px-5 text-center">
                {renderStatusBadge(product.status)}
              </td>

              {/* Actions */}
              <td className="py-4 px-5 text-right">
                <button
                  onClick={() => onEditClick?.(product)}
                  className="p-1.5 rounded-lg text-[#777586] hover:text-[#4132C7] hover:bg-[#EBE9FE]/50 transition-colors"
                  title="Edit product"
                  aria-label={`Edit ${product.product_name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
