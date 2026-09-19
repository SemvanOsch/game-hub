/**
 * Account session + friends state, driven by the shared socket.
 *
 * Logging in is optional: guests never touch this store. Once authenticated it
 * holds the session, the friends list (with presence + records), and pending
 * requests, all pushed by the server via `friends_update`. The session token is
 * persisted to localStorage so the app can resume identity on next launch.
 */
import { create } from 'zustand'
import type { FriendSummary, PublicUser } from '@shared/types'
import type { ServerMessage } from '@shared/protocol'
import { ensureConnection, onDisconnect, onServerMessage, sendMessage } from '../net/socket'

const TOKEN_KEY = 'game-launcher:session-token'

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
function persistToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore storage errors (e.g. private mode) */
  }
}

export interface Session {
  userId: string
  username: string
}

type PendingAuth = 'login' | 'signup' | 'resume' | null

interface AuthState {
  session: Session | null
  friends: FriendSummary[]
  incoming: PublicUser[]
  outgoing: PublicUser[]
  /** Which auth request is in flight (drives spinners / silent resume). */
  pending: PendingAuth
  authError: string | null
  friendError: string | null

  resume: () => void
  signup: (username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  sendRequest: (username: string) => void
  respond: (fromUserId: string, accept: boolean) => void
  removeFriend: (userId: string) => void
  clearAuthError: () => void
  clearFriendError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => {
  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'auth_result': {
        const wasResume = get().pending === 'resume'
        if (message.ok) {
          if (message.token) persistToken(message.token)
          set({
            session: message.profile
              ? { userId: message.profile.id, username: message.profile.username }
              : null,
            pending: null,
            authError: null
          })
        } else {
          // A failed resume is silent (expired token); other failures surface.
          if (wasResume) persistToken(null)
          set({ pending: null, authError: wasResume ? null : (message.error ?? 'Login failed.') })
        }
        break
      }
      case 'friends_update':
        set({
          friends: message.friends,
          incoming: message.incoming,
          outgoing: message.outgoing
        })
        break
      case 'friend_error':
        set({ friendError: message.message })
        break
      // Room/game messages are handled by the multiplayer store.
    }
  }

  onServerMessage(handleMessage)
  onDisconnect(() => {
    // The socket dropped: show as logged out but keep the token so the next
    // resume() (e.g. on relaunch) can restore the session.
    set({ session: null, friends: [], incoming: [], outgoing: [], pending: null })
  })

  async function authenticate(
    kind: 'login' | 'signup',
    username: string,
    password: string
  ): Promise<void> {
    set({ pending: kind, authError: null })
    try {
      await ensureConnection()
    } catch {
      set({ pending: null, authError: 'Could not reach the server.' })
      return
    }
    sendMessage({ type: kind, username, password })
  }

  return {
    session: null,
    friends: [],
    incoming: [],
    outgoing: [],
    pending: null,
    authError: null,
    friendError: null,

    resume() {
      const token = loadToken()
      if (!token) return
      set({ pending: 'resume' })
      ensureConnection().then(
        () => sendMessage({ type: 'resume_session', token }),
        () => set({ pending: null })
      )
    },

    signup(username, password) {
      return authenticate('signup', username, password)
    },
    login(username, password) {
      return authenticate('login', username, password)
    },

    logout() {
      sendMessage({ type: 'logout' })
      persistToken(null)
      set({ session: null, friends: [], incoming: [], outgoing: [], authError: null })
    },

    sendRequest(username) {
      set({ friendError: null })
      sendMessage({ type: 'friend_request', username })
    },
    respond(fromUserId, accept) {
      sendMessage({ type: 'respond_friend_request', fromUserId, accept })
    },
    removeFriend(userId) {
      sendMessage({ type: 'remove_friend', userId })
    },

    clearAuthError() {
      if (get().authError) set({ authError: null })
    },
    clearFriendError() {
      if (get().friendError) set({ friendError: null })
    }
  }
})
