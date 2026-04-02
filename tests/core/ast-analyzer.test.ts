import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../../src/core/ast-analyzer';

describe('analyzeFile', () => {
  it('extracts exported function with params and return type', () => {
    const result = analyzeFile('test.ts', `
export async function signIn(email: string, password: string): Promise<User | null> {
  return null;
}
    `);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('signIn');
    expect(result.functions[0].params).toContain('email: string');
    expect(result.functions[0].params).toContain('password: string');
    expect(result.functions[0].returnType).toBe('Promise<User | null>');
    expect(result.functions[0].isAsync).toBe(true);
    expect(result.functions[0].exported).toBe(true);
  });

  it('extracts exported arrow functions', () => {
    const result = analyzeFile('test.ts', `
export const getUser = (id: string): User => {
  return {} as User;
};
    `);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('getUser');
    expect(result.functions[0].exported).toBe(true);
  });

  it('extracts interfaces', () => {
    const result = analyzeFile('test.ts', `
export interface User {
  id: string;
  email: string;
  role: Role;
}
    `);

    expect(result.types).toHaveLength(1);
    expect(result.types[0].name).toBe('User');
    expect(result.types[0].kind).toBe('interface');
    expect(result.types[0].exported).toBe(true);
    expect(result.types[0].signature).toContain('interface User');
  });

  it('extracts type aliases', () => {
    const result = analyzeFile('test.ts', `
export type Role = 'admin' | 'editor' | 'viewer';
    `);

    expect(result.types).toHaveLength(1);
    expect(result.types[0].name).toBe('Role');
    expect(result.types[0].kind).toBe('type');
  });

  it('extracts enums', () => {
    const result = analyzeFile('test.ts', `
export enum Status {
  Active,
  Inactive,
  Pending,
}
    `);

    expect(result.types).toHaveLength(1);
    expect(result.types[0].name).toBe('Status');
    expect(result.types[0].kind).toBe('enum');
    expect(result.types[0].signature).toContain('Active');
  });

  it('extracts imports', () => {
    const result = analyzeFile('test.ts', `
import { User, Role } from './types';
import type { Config } from '../config';
import React from 'react';
    `);

    expect(result.imports).toHaveLength(3);
    expect(result.imports[0].from).toBe('./types');
    expect(result.imports[0].symbols).toEqual(['User', 'Role']);
    expect(result.imports[0].isTypeOnly).toBe(false);
    expect(result.imports[1].isTypeOnly).toBe(true);
  });

  it('detects React components (JSX return)', () => {
    const result = analyzeFile('test.tsx', `
import { useState } from 'react';

export function LoginForm({ onSubmit }: { onSubmit: () => void }) {
  const [email, setEmail] = useState('');
  return <form onSubmit={onSubmit}><input /></form>;
}
    `);

    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('LoginForm');
    expect(result.components[0].hooks).toContain('useState');
    expect(result.exports.some(e => e.kind === 'component')).toBe(true);
  });

  it('detects arrow function components', () => {
    const result = analyzeFile('test.tsx', `
export const Header = ({ user }: { user: User }) => {
  return <div>{user.name}</div>;
};
    `);

    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('Header');
  });

  it('does not classify non-exported functions as exports', () => {
    const result = analyzeFile('test.ts', `
function internalHelper(x: number): number {
  return x * 2;
}
export function publicFn(): void {}
    `);

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe('publicFn');
    expect(result.functions).toHaveLength(2);
  });

  it('extracts JSDoc summary', () => {
    const result = analyzeFile('test.ts', `
/** Authenticates a user by email and password */
export function authenticate(email: string, password: string): boolean {
  return true;
}
    `);

    expect(result.functions[0].jsdoc).toBe('Authenticates a user by email and password');
  });

  it('handles exported consts', () => {
    const result = analyzeFile('test.ts', `
export const MAX_RETRIES = 3;
export const API_URL = 'https://example.com';
    `);

    expect(result.exports).toHaveLength(2);
    expect(result.exports[0].kind).toBe('const');
  });

  it('handles empty file', () => {
    const result = analyzeFile('test.ts', '');
    expect(result.exports).toHaveLength(0);
    expect(result.functions).toHaveLength(0);
    expect(result.types).toHaveLength(0);
  });
});
