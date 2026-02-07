import { AppError } from '../../utils/errors.js';

/* eslint-disable @typescript-eslint/no-unused-vars */

export async function getPermissions(_path: string): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}

export async function setPermissions(
  _path: string,
  _permissions: unknown,
): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}

export async function getQuota(_path: string): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}

export async function setQuota(_path: string, _quotaBytes: number): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}

export async function getDirInfo(_path: string): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}

export async function listMounts(): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}

export async function getQosUsage(): Promise<never> {
  throw new AppError('Not implemented', 501, 'NOT_IMPLEMENTED');
}
