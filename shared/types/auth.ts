/** Identity source for users */
export type IdentitySource = 'LOCAL' | 'active_directory' | 'SSO_SAML' | 'MULTISITE';

/** Auth backend types */
export type AuthBackendType = 'LOCAL_ES' | 'AD' | 'SSO_SAML' | 'MULTISITE';

/** Login request */
export interface ILoginRequest {
  username: string;
  password: string;
}

/** Per-space permission for the current user */
export interface IUserSpacePermission {
  spaceName: string;
  accessType: 'readwrite' | 'readonly' | 'admin';
}

/** Login response */
export interface ILoginResponse {
  token: string;
  user: {
    username: string;
    isAdmin: boolean;
    spaces: IUserSpacePermission[];
    managedSpaces: string[];
  };
  backends: AuthBackendType[];
}

/** Current user info */
export interface ICurrentUser {
  username: string;
  isAdmin: boolean;
  spaces?: IUserSpacePermission[];
  managedSpaces?: string[];
}

/** Auth backends response */
export interface IAuthBackendsResponse {
  backends: AuthBackendType[];
  adActive: boolean;
  ssoActive: boolean;
}
