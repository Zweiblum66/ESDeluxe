/** A file or directory entry in a directory listing */
export interface IFileEntry {
  name: string;
  path: string;           // Relative to space Content root
  type: 'file' | 'directory';
  size: number;           // Bytes
  mtime: number;          // Unix timestamp (seconds)
  atime: number;          // Unix timestamp (seconds)
  ctime: number;          // Unix timestamp (seconds)
  owner: string;
  group: string;
  mode: number;           // Unix mode bits
  inode: number;
  nlink: number;
  goal?: string;
  isArchiveStub?: boolean;
  archiveInfo?: {
    originalSize: number;
    archiveLocationName: string;
    archivedAt: number;
    catalogEntryId: number;
  };
}

/** Result of listing a directory */
export interface IDirectoryListing {
  path: string;           // Relative path within space
  spaceName: string;
  entries: IFileEntry[];
  totalSize: number;
  totalFiles: number;
  totalDirs: number;
}

/**
 * EFS ACL entry types.
 * EFS extends NFSv4 ACLs with additional bits:
 *   a = admin, m = managed modify, g = setgid
 */
export type AclEntryType = 'user' | 'group' | 'other' | 'mask' | 'flags';

/** A single ACL entry from efs-getperms */
export interface IEfsAclEntry {
  type: AclEntryType;
  qualifier: string;      // Username/groupname, empty for unnamed entries
  read: boolean;
  write: boolean;
  execute: boolean;
  admin: boolean;         // EFS 'a' bit
  isDefault: boolean;     // Is this a default (inherited) ACL entry
}

/** Full ACL information for a file or directory */
export interface IFileAcl {
  path: string;
  spaceName: string;
  fileType: 'f' | 'd';
  owner: string;
  group: string;
  entries: IEfsAclEntry[];
  flags: string;          // Raw flags string (e.g., "---g-")
  mask: string;           // Raw mask string (e.g., "-rwx")
}

/** Request to set ACL entries */
export interface ISetAclRequest {
  entries?: IEfsAclEntry[];
  owner?: string;
  group?: string;
  recursive?: boolean;
  removeAll?: boolean;    // Remove all extended ACL entries
  removeDefault?: boolean; // Remove all default ACL entries
}

/** Directory info from efs-dirinfo */
export interface IDirInfo {
  inodes: number;
  directories: number;
  files: number;
  objectStorageStubs: number;
  chunks: number;
  length: number;         // Bytes (logical size)
  size: number;           // Bytes (physical size on disk)
  objectStorageLength: number;
}

/** File info from efs-fileinfo */
export interface IFileChunkInfo {
  path: string;
  chunks: {
    index: number;
    id: string;
    copies: {
      copyNumber: number;
      location: string;   // e.g., "192.168.178.191:9422:default_group"
    }[];
  }[];
}
