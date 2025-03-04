// src/utils/convert.ts
import Decimal from 'decimal.js';

/**
 * Converts a readable number of tokens to the smallest unit (e.g., lamports for SOL).
 * @param {number} value - The amount in readable units.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {string} - The amount in lamports.
 */
export function fromNumberToLamports(value: number, decimals: number): string {
    return new Decimal(value).times(new Decimal(10).pow(decimals)).toString();
}

/**
 * Converts the smallest unit of tokens (e.g., lamports for SOL) to a readable number.
 * @param {number} value - The amount in the smallest unit.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {number} - The readable amount.
 */
export function fromLamportsToNumber(value: number, decimals: number): number {
    const result = value / Math.pow(10, decimals);
    const roundedResult = result.toFixed(0);
    return parseInt(roundedResult);
}

/**
 * Converts a readable number of tokens to the smallest unit (e.g., lamports for SOL).
 * @param {number} value - The amount in readable units.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {typeof Decimal.prototype} - The amount in the smallest unit.
 */
export function fromNumberToMinorUnits(value: number, decimals: number): typeof Decimal.prototype {
    return new Decimal(value).times(new Decimal(10).pow(decimals));
}

/**
 * Converts the smallest unit of tokens (e.g., lamports for SOL) to a readable number.
 * @param {typeof Decimal.prototype} value - The amount in the smallest unit.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {typeof Decimal.prototype} - The readable amount.
 */
export function fromMinorUnitsToNumber(value: typeof Decimal.prototype, decimals: number): typeof Decimal.prototype {
    return value.div(new Decimal(10).pow(decimals));
}