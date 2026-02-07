import ldap, { type Client, type SearchOptions, type Change } from 'ldapjs';
import { logger } from '../../utils/logger.js';
import { LdapError } from '../../utils/errors.js';

interface LdapClientOptions {
  uri: string;
  bindDn: string;
  bindPassword: string;
  rejectUnauthorized: boolean;
}

interface LdapEntry {
  dn: string;
  [key: string]: string | string[] | undefined;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

class LdapClient {
  private client: Client | null = null;
  private options: LdapClientOptions | null = null;
  private connected = false;
  private reconnecting = false;
  private reconnectAttempt = 0;

  /**
   * Initialize the LDAP client and bind with admin credentials.
   */
  async init(options: LdapClientOptions): Promise<void> {
    this.options = options;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.options) {
      throw new LdapError('LDAP client not configured. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      this.client = ldap.createClient({
        url: this.options!.uri,
        tlsOptions: {
          rejectUnauthorized: this.options!.rejectUnauthorized,
        },
        reconnect: false, // We handle reconnection ourselves
      });

      this.client.on('error', (err: Error) => {
        logger.error({ err }, `LDAP client error: ${err.message}`);
        this.connected = false;
        this.scheduleReconnect();
      });

      this.client.on('connectTimeout', () => {
        logger.error('LDAP connection timeout');
        this.connected = false;
        this.scheduleReconnect();
      });

      this.client.on('close', () => {
        logger.warn('LDAP connection closed');
        this.connected = false;
        this.scheduleReconnect();
      });

      // If bind DN and password are provided, do an authenticated bind.
      // Otherwise use anonymous access (no bind needed for read-only).
      const bindDn = this.options!.bindDn;
      const bindPassword = this.options!.bindPassword;

      if (bindDn && bindPassword) {
        this.client.bind(bindDn, bindPassword, (err) => {
          if (err) {
            logger.error({ err }, `LDAP bind failed: ${err.message}`);
            this.connected = false;
            reject(new LdapError(`LDAP bind failed: ${err.message}`));
            return;
          }

          logger.info('LDAP client bound successfully (authenticated)');
          this.connected = true;
          this.reconnectAttempt = 0;
          resolve();
        });
      } else {
        // Anonymous access — mark as connected once the client is created
        logger.info('LDAP client using anonymous access (read-only)');
        this.connected = true;
        this.reconnectAttempt = 0;
        resolve();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnecting || !this.options) return;
    this.reconnecting = true;

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempt),
      MAX_RECONNECT_DELAY_MS,
    );

    logger.info(
      { attempt: this.reconnectAttempt + 1, delay },
      `Scheduling LDAP reconnect in ${delay}ms`,
    );

    setTimeout(async () => {
      this.reconnecting = false;
      this.reconnectAttempt++;
      try {
        await this.connect();
      } catch (err) {
        logger.error({ err }, 'LDAP reconnect failed');
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Search the LDAP directory.
   */
  async search(baseDn: string, options: SearchOptions): Promise<LdapEntry[]> {
    if (!this.client || !this.connected) {
      throw new LdapError('LDAP client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.search(baseDn, options, (err, res) => {
        if (err) {
          reject(new LdapError(`LDAP search failed: ${err.message}`));
          return;
        }

        const entries: LdapEntry[] = [];

        res.on('searchEntry', (entry) => {
          const obj: LdapEntry = { dn: entry.dn.toString() };
          for (const attr of entry.attributes) {
            const values = attr.values;
            obj[attr.type] = values.length === 1 ? values[0] : values;
          }
          entries.push(obj);
        });

        res.on('error', (searchErr) => {
          reject(new LdapError(`LDAP search error: ${searchErr.message}`));
        });

        res.on('end', (result) => {
          if (result?.status !== 0) {
            reject(new LdapError(`LDAP search ended with status: ${result?.status}`));
            return;
          }
          resolve(entries);
        });
      });
    });
  }

  /**
   * Modify an LDAP entry.
   */
  async modify(dn: string, changes: Change | Change[]): Promise<void> {
    if (!this.client || !this.connected) {
      throw new LdapError('LDAP client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.modify(dn, changes, (err) => {
        if (err) {
          reject(new LdapError(`LDAP modify failed on ${dn}: ${err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Returns whether the LDAP client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Gracefully disconnect from the LDAP server.
   */
  disconnect(): void {
    if (this.client) {
      this.client.unbind(() => {
        logger.info('LDAP client disconnected');
      });
      this.client = null;
      this.connected = false;
    }
  }
}

/** Singleton LDAP client instance */
let _instance: LdapClient | null = null;

/**
 * Initialize the global LDAP client.
 */
export async function initLdapClient(options: LdapClientOptions): Promise<void> {
  _instance = new LdapClient();
  await _instance.init(options);
}

/**
 * Get the singleton LDAP client instance.
 * Throws if not initialized.
 */
export function getLdapClient(): LdapClient {
  if (!_instance) {
    throw new LdapError('LDAP client not initialized. Call initLdapClient() first.');
  }
  return _instance;
}
