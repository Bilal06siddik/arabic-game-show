import type { BankRoomState, BankTile } from '@ags/shared';
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, OrthographicCamera, useTexture } from '@react-three/drei';
import { animated, useSpring } from '@react-spring/three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useLanguage } from '../../components/LanguageProvider';
import boardGrainUrl from './assets/board-grain.svg';
import {
  BOARD_CENTER_SIZE,
  BOARD_INNER_SIZE,
  BOARD_OUTER_SIZE,
  BOARD_TILE_COUNT,
  CAMERA_PAN_LIMIT,
  normalizeTileIndex,
  tileFootprint,
  tileIndexToWorld,
  tileRotationY,
} from './boardMath';
import { getTileTexture } from './tileTexture';

interface FeedItem {
  at: number;
  label: string;
}

interface DiceResultEvent {
  nonce: number;
  playerId: string;
  d1: number;
  d2: number;
  total: number;
  stayedInJail?: boolean;
  threeDoubles?: boolean;
}

interface Bank3DExperienceProps {
  roomCode: string;
  state?: BankRoomState;
  sessionPlayerId: string;
  connected: boolean;
  error: string;
  feed: FeedItem[];
  onEmit: (event: string, payload?: unknown) => void;
  lastDiceEvent?: DiceResultEvent;
  shareLink: string;
  showLobbyInvite: boolean;
  onCopyInviteLink: () => void;
  copiedLink: boolean;
}

interface DiceVisualState {
  nonce: number;
  d1: number;
  d2: number;
}

const DEFAULT_PLAYER_COLORS = ['#ff6f61', '#2fa7ff', '#f6c945', '#63d17d', '#bf8bff', '#ff9f40'];
const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(24, 24, 24);
const DEFAULT_CAMERA_ZOOM = 30;

export function Bank3DExperience(props: Bank3DExperienceProps): JSX.Element {
  const { tr, language } = useLanguage();
  const { state } = props;

  const me = useMemo(
    () => state?.players.find((player) => player.id === props.sessionPlayerId),
    [props.sessionPlayerId, state],
  );
  const isHost = Boolean(me?.isHost);
  const myTurn = state?.turn?.currentPlayerId === me?.id;
  const pending = state?.pendingAction;

  const ownerMap = useMemo(() => {
    const map = new Map<number, string>();
    state?.bankPlayers.forEach((bankPlayer) => {
      bankPlayer.assets.forEach((asset) => {
        map.set(asset.tileId, bankPlayer.playerId);
      });
    });
    return map;
  }, [state]);

  const [selectedTileId, setSelectedTileId] = useState<number>(0);
  const [feedOpen, setFeedOpen] = useState(false);
  const [diceVisual, setDiceVisual] = useState<DiceVisualState>();
  const [cameraResetNonce, setCameraResetNonce] = useState(0);
  const [bidAmount, setBidAmount] = useState(10);
  const [kickPlayerId, setKickPlayerId] = useState('');

  const tokenPositions = useAnimatedTokenPositions(state, props.lastDiceEvent);

  useEffect(() => {
    if (!props.lastDiceEvent) {
      return;
    }
    setDiceVisual({
      nonce: props.lastDiceEvent.nonce,
      d1: props.lastDiceEvent.d1,
      d2: props.lastDiceEvent.d2,
    });
  }, [props.lastDiceEvent]);

  useEffect(() => {
    if (!state || selectedTileId < state.board.tiles.length) {
      return;
    }
    setSelectedTileId(0);
  }, [selectedTileId, state]);

  const selectedTile = state?.board.tiles.find((tile) => tile.id === selectedTileId);
  const selectedTileOwnerId = selectedTile ? ownerMap.get(selectedTile.id) : undefined;
  const selectedOwnerName = state?.players.find((player) => player.id === selectedTileOwnerId)?.name;

  const scoreboard = useMemo(() => {
    return state?.bankPlayers
      .map((bankPlayer) => ({
        bankPlayer,
        profile: state.players.find((player) => player.id === bankPlayer.playerId),
      }))
      .sort((a, b) => b.bankPlayer.cash - a.bankPlayer.cash);
  }, [state]);

  return (
    <div className="bank3d-root">
      <section className="bank3d-canvas-panel">
        <Canvas shadows dpr={[1, 1.9]}>
          <BankSceneWorld
            state={state}
            language={language}
            selectedTileId={selectedTileId}
            onSelectTile={setSelectedTileId}
            tokenPositions={tokenPositions}
            diceVisual={diceVisual}
            cameraResetNonce={cameraResetNonce}
          />
        </Canvas>

        <div className="bank3d-hud bank3d-hud-top">
          <div className="bank3d-pill">
            <strong>{tr('common.roomCode')}:</strong> {props.roomCode}
          </div>
          <div className="bank3d-pill">
            <strong>{tr('common.status')}:</strong> {props.connected ? tr('bank.connected') : tr('common.notConnected')}
          </div>
          <div className="bank3d-pill">
            <strong>{tr('bank.turnNumber')}:</strong> {state?.turn?.turnNumber ?? '-'}
          </div>
          <div className="bank3d-pill">
            <strong>{tr('bank.currentPlayer')}:</strong> {state?.turn?.currentPlayerId ?? '-'}
          </div>
          <div className="bank3d-pill">
            <strong>{tr('bank.pendingAction')}:</strong> {pending?.type ?? tr('bank.none')}
          </div>
          <div className="bank3d-pill">
            <strong>{tr('bank.dice')}:</strong> {state?.lastDice ? `${state.lastDice[0]} + ${state.lastDice[1]}` : '--'}
          </div>
          <div className="bank3d-camera-tools">
            <button
              type="button"
              className="secondary-btn bank3d-reset-btn"
              onClick={() => setCameraResetNonce((value) => value + 1)}
            >
              {tr('bank.resetCamera')}
            </button>
            <span className="bank3d-camera-hint">{tr('bank.cameraHint')}</span>
          </div>
          {props.error ? <div className="bank3d-pill danger">{props.error}</div> : null}
        </div>

        <div className="bank3d-hud bank3d-hud-left">
          <section className="bank3d-card">
            <h3>{tr('bank.controls')}</h3>
            {props.showLobbyInvite ? (
              <div className="bank3d-inline-box">
                <p>{tr('bank.waitingForPlayers')}</p>
                <p>
                  {tr('bank.playersInLobby')}: {state?.players.filter((player) => player.role === 'player').length ?? 1}
                </p>
                <p>
                  {tr('bank.inviteLink')}: <code>{props.shareLink}</code>
                </p>
                <button type="button" className="secondary-btn" onClick={props.onCopyInviteLink}>
                  {props.copiedLink ? tr('bank.linkCopied') : tr('bank.copyLink')}
                </button>
              </div>
            ) : null}

            {isHost && state?.meta.status === 'lobby' ? (
              <button type="button" className="primary-btn" onClick={() => props.onEmit('bank:start_game')}>
                {tr('bank.startGame')}
              </button>
            ) : null}

            {myTurn && pending?.type === 'roll' ? (
              <button type="button" className="primary-btn" onClick={() => props.onEmit('bank:roll_request')}>
                {tr('bank.rollDice')}
              </button>
            ) : null}

            {myTurn && pending?.type === 'buy_or_auction' ? (
              <div className="inline-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => props.onEmit('bank:buy_commit', { tileId: pending.tileId, accept: true })}
                >
                  {tr('bank.buy')}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => props.onEmit('bank:buy_commit', { tileId: pending.tileId, accept: false })}
                >
                  {tr('bank.auction')}
                </button>
              </div>
            ) : null}

            {state?.auction ? (
              <div className="bank3d-inline-box">
                <p>
                  {tr('bank.auctionTile')}: #{state.auction.tileId}
                </p>
                <label>
                  {tr('bank.bidAmount')}
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(event) => setBidAmount(Number(event.target.value))}
                  />
                </label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => props.onEmit('bank:auction_bid', { amount: bidAmount })}
                  >
                    {tr('bank.auction')}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => props.onEmit('bank:auction_end')}>
                    {tr('bank.closeAuction')}
                  </button>
                </div>
              </div>
            ) : null}

            {myTurn && pending?.type === 'end_turn' ? (
              <button type="button" className="primary-btn" onClick={() => props.onEmit('bank:end_turn')}>
                {tr('bank.endTurn')}
              </button>
            ) : null}
          </section>
        </div>

        <div className="bank3d-hud bank3d-hud-right">
          <section className="bank3d-card">
            <h3>{tr('bank.tileDetails')}</h3>
            {selectedTile ? (
              <>
                <p>
                  #{selectedTile.id} {selectedTile.name[language]}
                </p>
                <p>
                  <strong>{tr('bank.owner')}:</strong> {selectedOwnerName ?? tr('bank.unowned')}
                </p>
                <p>
                  <strong>{tr('bank.group')}:</strong>{' '}
                  {selectedTile.kind === 'property'
                    ? formatTileColorLabel(selectedTile.color)
                    : tr('bank.noGroup')}
                </p>
                <p>
                  <strong>{tr('bank.tileKind')}:</strong> {selectedTile.kind}
                </p>
              </>
            ) : (
              <p>{tr('bank.none')}</p>
            )}
          </section>

          <section className="bank3d-card">
            <h3>{tr('bank.players')}</h3>
            <div className="bank3d-player-list">
              {scoreboard?.map(({ bankPlayer, profile }) => (
                <article key={bankPlayer.playerId} className={`player-card ${bankPlayer.playerId === me?.id ? 'self' : ''}`}>
                  <h4>{profile?.name ?? bankPlayer.playerId}</h4>
                  <p>
                    {tr('bank.cash')}: {bankPlayer.cash}
                  </p>
                  <p>
                    {tr('bank.position')}: {tokenPositions[bankPlayer.playerId] ?? bankPlayer.position}
                  </p>
                  <p>
                    {tr('bank.assets')}: {bankPlayer.assets.length}
                  </p>
                  <p>{bankPlayer.bankrupt ? tr('bank.bankrupt') : tr('bank.active')}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="bank3d-bottom-row">
        <details className="bank3d-card bank3d-events" open={feedOpen} onToggle={(event) => setFeedOpen(event.currentTarget.open)}>
          <summary>{tr('bank.events')}</summary>
          <ul className="event-list">
            {props.feed.map((item) => (
              <li key={`${item.at}-${item.label}`}>
                <span>{new Date(item.at).toLocaleTimeString()}</span>
                <strong>{item.label}</strong>
              </li>
            ))}
          </ul>
        </details>

        {isHost ? (
          <details className="bank3d-card bank3d-host-drawer">
            <summary>{tr('bank.hostTools')}</summary>
            <label>
              {tr('bank.kickPlayer')}
              <select value={kickPlayerId} onChange={(event) => setKickPlayerId(event.target.value)}>
                <option value="">{tr('bank.none')}</option>
                {state?.players
                  .filter((player) => player.id !== me?.id)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="danger-btn"
              disabled={!kickPlayerId}
              onClick={() =>
                props.onEmit('bank:host_action', {
                  action: 'kick',
                  payload: { playerId: kickPlayerId },
                })
              }
            >
              {tr('bank.kickPlayer')}
            </button>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function BankSceneWorld(props: {
  state?: BankRoomState;
  language: 'ar' | 'en';
  selectedTileId: number;
  onSelectTile: (tileId: number) => void;
  tokenPositions: Record<string, number>;
  diceVisual?: DiceVisualState;
  cameraResetNonce: number;
}): JSX.Element {
  const boardGrain = useTexture(boardGrainUrl) as THREE.Texture;

  const suppressTileSelectionUntilRef = useRef(0);

  useEffect(() => {
    boardGrain.wrapS = THREE.RepeatWrapping;
    boardGrain.wrapT = THREE.RepeatWrapping;
    boardGrain.repeat.set(6, 6);
    boardGrain.needsUpdate = true;
  }, [boardGrain]);

  const handlePanGesture = useCallback(() => {
    suppressTileSelectionUntilRef.current = Date.now() + 180;
  }, []);

  const canSelectTile = useCallback(() => Date.now() >= suppressTileSelectionUntilRef.current, []);

  const occupancy = useMemo(() => {
    if (!props.state) {
      return new Map<string, [number, number]>();
    }

    const byTile = new Map<number, string[]>();
    props.state.bankPlayers.forEach((player) => {
      const tileId = props.tokenPositions[player.playerId] ?? player.position;
      const list = byTile.get(tileId) ?? [];
      list.push(player.playerId);
      byTile.set(tileId, list);
    });

    const offsets = new Map<string, [number, number]>();
    byTile.forEach((playerIds) => {
      playerIds.forEach((playerId, index) => {
        const angle = (index / Math.max(1, playerIds.length)) * Math.PI * 2;
        const radius = playerIds.length === 1 ? 0 : 0.42;
        offsets.set(playerId, [Math.cos(angle) * radius, Math.sin(angle) * radius]);
      });
    });
    return offsets;
  }, [props.state, props.tokenPositions]);

  return (
    <>
      <color attach="background" args={['#050a17']} />
      <fog attach="fog" args={['#050a17', 44, 92]} />

      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#74c7ff', '#031021', 0.5]} />
      <directionalLight
        castShadow
        intensity={0.78}
        position={[26, 32, 16]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight intensity={0.35} position={[-18, 24, -18]} />

      <BankCameraRig resetNonce={props.cameraResetNonce} onPanGesture={handlePanGesture} />

      <BoardStage boardGrain={boardGrain} />

      <BoardRing
        state={props.state}
        language={props.language}
        selectedTileId={props.selectedTileId}
        onSelectTile={props.onSelectTile}
        canSelectTile={canSelectTile}
      />

      {props.state?.board.tiles
        .filter((tile) => tileIndexToWorld(tile.id).isCorner)
        .map((tile) => {
          const world = tileIndexToWorld(tile.id);
          return (
            <mesh key={`corner-pedestal-${tile.id}`} castShadow receiveShadow position={[world.x, 0.76, world.z]}>
              <boxGeometry args={[0.86, 0.34, 0.86]} />
              <meshStandardMaterial color="#6e7788" roughness={0.5} metalness={0.4} />
            </mesh>
          );
        })}

      {props.state?.bankPlayers.map((bankPlayer, index) => {
        const tileId = props.tokenPositions[bankPlayer.playerId] ?? bankPlayer.position;
        const world = tileIndexToWorld(tileId);
        const offset = occupancy.get(bankPlayer.playerId) ?? [0, 0];
        const profile = props.state?.players.find((player) => player.id === bankPlayer.playerId);
        const tokenColor = pieceColorToHex(profile?.pieceColor) ?? DEFAULT_PLAYER_COLORS[index % DEFAULT_PLAYER_COLORS.length];
        return (
          <TokenPiece
            key={bankPlayer.playerId}
            color={tokenColor}
            name={profile?.name ?? bankPlayer.playerId}
            target={[world.x + offset[0], 0.58, world.z + offset[1]]}
          />
        );
      })}

      <DiceTable diceVisual={props.diceVisual} />
    </>
  );
}

function BankCameraRig(props: {
  resetNonce: number;
  onPanGesture: () => void;
}): JSX.Element {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const panStartTargetRef = useRef(new THREE.Vector3());
  const hasDraggedRef = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.update();
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    controls.target.set(0, 0, 0);
    const camera = controls.object as THREE.OrthographicCamera;
    camera.position.set(DEFAULT_CAMERA_OFFSET.x, DEFAULT_CAMERA_OFFSET.y, DEFAULT_CAMERA_OFFSET.z);
    camera.zoom = DEFAULT_CAMERA_ZOOM;
    camera.updateProjectionMatrix();
    controls.update();
  }, [props.resetNonce]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const clampedX = THREE.MathUtils.clamp(controls.target.x, -CAMERA_PAN_LIMIT, CAMERA_PAN_LIMIT);
    const clampedZ = THREE.MathUtils.clamp(controls.target.z, -CAMERA_PAN_LIMIT, CAMERA_PAN_LIMIT);

    controls.target.x = clampedX;
    controls.target.z = clampedZ;

    const camera = controls.object as THREE.OrthographicCamera;
    camera.position.set(
      controls.target.x + DEFAULT_CAMERA_OFFSET.x,
      DEFAULT_CAMERA_OFFSET.y,
      controls.target.z + DEFAULT_CAMERA_OFFSET.z,
    );
    camera.lookAt(controls.target.x, 0, controls.target.z);
  });

  return (
    <>
      <OrthographicCamera makeDefault position={[24, 24, 24]} zoom={DEFAULT_CAMERA_ZOOM} near={0.1} far={240} />
      <OrbitControls
        ref={controlsRef}
        enableRotate={false}
        enablePan
        enableZoom
        panSpeed={0.9}
        zoomSpeed={1}
        minZoom={24}
        maxZoom={46}
        target={[0, 0, 0]}
        onStart={() => {
          const controls = controlsRef.current;
          if (!controls) {
            return;
          }
          panStartTargetRef.current.copy(controls.target);
          hasDraggedRef.current = false;
        }}
        onChange={() => {
          const controls = controlsRef.current;
          if (!controls) {
            return;
          }
          if (controls.target.distanceToSquared(panStartTargetRef.current) > 0.0008) {
            hasDraggedRef.current = true;
          }
        }}
        onEnd={() => {
          if (hasDraggedRef.current) {
            props.onPanGesture();
          }
        }}
      />
    </>
  );
}

function BoardStage(props: {
  boardGrain: THREE.Texture;
}): JSX.Element {
  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
        <planeGeometry args={[44, 44]} />
        <shadowMaterial opacity={0.2} />
      </mesh>

      <mesh receiveShadow position={[0, -0.26, 0]}>
        <boxGeometry args={[BOARD_OUTER_SIZE, 0.64, BOARD_OUTER_SIZE]} />
        <meshStandardMaterial color="#161d2d" map={props.boardGrain} roughness={0.84} metalness={0.2} />
      </mesh>

      <mesh receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[BOARD_INNER_SIZE, 0.26, BOARD_INNER_SIZE]} />
        <meshStandardMaterial color="#0d152a" roughness={0.9} metalness={0.08} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <planeGeometry args={[BOARD_CENTER_SIZE, BOARD_CENTER_SIZE]} />
        <meshStandardMaterial
          color="#1b3566"
          roughness={0.54}
          metalness={0.16}
        />
      </mesh>
    </>
  );
}

function BoardRing(props: {
  state?: BankRoomState;
  language: 'ar' | 'en';
  selectedTileId: number;
  onSelectTile: (tileId: number) => void;
  canSelectTile: () => boolean;
}): JSX.Element {
  return (
    <>
      {props.state?.board.tiles.map((tile) => (
        <TileCard
          key={tile.id}
          tile={tile}
          language={props.language}
          selected={tile.id === props.selectedTileId}
          onSelectTile={props.onSelectTile}
          canSelectTile={props.canSelectTile}
        />
      ))}
    </>
  );
}

function TileCard(props: {
  tile: BankTile;
  language: 'ar' | 'en';
  selected: boolean;
  onSelectTile: (tileId: number) => void;
  canSelectTile: () => boolean;
}): JSX.Element {
  const world = tileIndexToWorld(props.tile.id);
  const [sizeX, sizeZ] = tileFootprint(world.isCorner);
  const rotationY = tileRotationY(world.side);
  const surfaceTexture = useMemo(() => getTileTexture(props.tile, props.language), [props.tile, props.language]);

  const handleSelect = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!props.canSelectTile()) {
        return;
      }
      props.onSelectTile(props.tile.id);
    },
    [props.canSelectTile, props.onSelectTile, props.tile.id],
  );

  return (
    <group position={[world.x, 0.12, world.z]} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow onClick={handleSelect}>
        <boxGeometry args={[sizeX, 0.34, sizeZ]} />
        <meshStandardMaterial
          color={props.selected ? '#25365d' : '#0f1830'}
          roughness={0.78}
          metalness={0.14}
          emissive={props.selected ? '#29a8f7' : '#000000'}
          emissiveIntensity={props.selected ? 0.22 : 0}
        />
      </mesh>

      <mesh position={[0, 0.19, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={handleSelect}>
        <planeGeometry args={[sizeX - 0.16, sizeZ - 0.16]} />
        <meshStandardMaterial map={surfaceTexture} roughness={0.9} metalness={0.04} />
      </mesh>

      {props.selected ? (
        <mesh position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.min(sizeX, sizeZ) * 0.35, Math.min(sizeX, sizeZ) * 0.43, 32]} />
          <meshBasicMaterial color="#5bc7ff" transparent opacity={0.82} />
        </mesh>
      ) : null}
    </group>
  );
}

function TokenPiece(props: {
  color: string;
  name: string;
  target: [number, number, number];
}): JSX.Element {
  const spring = useSpring({
    position: props.target,
    config: {
      mass: 1.1,
      tension: 220,
      friction: 24,
    },
  });

  return (
    <animated.group position={spring.position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.38, 0.74, 24]} />
        <meshStandardMaterial color={props.color} metalness={0.2} roughness={0.42} />
      </mesh>
      <mesh castShadow position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Html position={[0, 0.92, 0]} center distanceFactor={12} transform>
        <div className="bank3d-token-name">{props.name}</div>
      </Html>
    </animated.group>
  );
}

function DiceTable(props: { diceVisual?: DiceVisualState }): JSX.Element {
  const [dieOneSpring, dieOneApi] = useSpring(() => ({
    px: -1.1,
    py: 0.96,
    pz: 0.6,
    rx: 0.2,
    ry: 0.3,
    rz: 0.05,
    config: { mass: 1.4, tension: 170, friction: 20 },
  }));
  const [dieTwoSpring, dieTwoApi] = useSpring(() => ({
    px: 1.1,
    py: 0.96,
    pz: -0.5,
    rx: 0.4,
    ry: -0.15,
    rz: 0.2,
    config: { mass: 1.4, tension: 170, friction: 20 },
  }));

  const d1 = props.diceVisual?.d1 ?? 1;
  const d2 = props.diceVisual?.d2 ?? 1;

  useEffect(() => {
    if (!props.diceVisual) {
      return;
    }

    dieOneApi.start({
      from: {
        px: -3.2,
        py: 3.8,
        pz: 2.1,
        rx: Math.PI * 2.6,
        ry: Math.PI * 2.1,
        rz: Math.PI * 1.3,
      },
      to: {
        px: -1.05,
        py: 0.96,
        pz: 0.55,
        rx: rotationForDiceValue(props.diceVisual.d1)[0],
        ry: rotationForDiceValue(props.diceVisual.d1)[1],
        rz: rotationForDiceValue(props.diceVisual.d1)[2],
      },
    });

    dieTwoApi.start({
      from: {
        px: 3.0,
        py: 3.9,
        pz: -2.2,
        rx: Math.PI * 2.3,
        ry: Math.PI * 1.9,
        rz: Math.PI * 2.6,
      },
      to: {
        px: 1.1,
        py: 0.96,
        pz: -0.55,
        rx: rotationForDiceValue(props.diceVisual.d2)[0],
        ry: rotationForDiceValue(props.diceVisual.d2)[1],
        rz: rotationForDiceValue(props.diceVisual.d2)[2],
      },
    });
  }, [dieOneApi, dieTwoApi, props.diceVisual]);

  return (
    <>
      <mesh receiveShadow position={[0, 0.56, 0]}>
        <boxGeometry args={[7.2, 0.44, 7.2]} />
        <meshStandardMaterial color="#28407a" roughness={0.66} metalness={0.24} />
      </mesh>

      <animated.group
        position-x={dieOneSpring.px}
        position-y={dieOneSpring.py}
        position-z={dieOneSpring.pz}
        rotation-x={dieOneSpring.rx}
        rotation-y={dieOneSpring.ry}
        rotation-z={dieOneSpring.rz}
      >
        <mesh castShadow>
          <boxGeometry args={[0.72, 0.72, 0.72]} />
          <meshStandardMaterial color="#f8fbff" metalness={0.05} roughness={0.5} />
        </mesh>
        <Html position={[0, 0.55, 0]} center distanceFactor={9} transform>
          <div className="bank3d-die-value">{d1}</div>
        </Html>
      </animated.group>

      <animated.group
        position-x={dieTwoSpring.px}
        position-y={dieTwoSpring.py}
        position-z={dieTwoSpring.pz}
        rotation-x={dieTwoSpring.rx}
        rotation-y={dieTwoSpring.ry}
        rotation-z={dieTwoSpring.rz}
      >
        <mesh castShadow>
          <boxGeometry args={[0.72, 0.72, 0.72]} />
          <meshStandardMaterial color="#f8fbff" metalness={0.05} roughness={0.5} />
        </mesh>
        <Html position={[0, 0.55, 0]} center distanceFactor={9} transform>
          <div className="bank3d-die-value">{d2}</div>
        </Html>
      </animated.group>
    </>
  );
}

function rotationForDiceValue(value: number): [number, number, number] {
  switch (value) {
    case 1:
      return [0, 0, 0];
    case 2:
      return [0, 0, Math.PI / 2];
    case 3:
      return [Math.PI / 2, 0, 0];
    case 4:
      return [-Math.PI / 2, 0, 0];
    case 5:
      return [0, 0, -Math.PI / 2];
    case 6:
      return [Math.PI, 0, 0];
    default:
      return [0, 0, 0];
  }
}

function useAnimatedTokenPositions(
  state?: BankRoomState,
  lastDiceEvent?: DiceResultEvent,
): Record<string, number> {
  const [positions, setPositions] = useState<Record<string, number>>({});
  const positionsRef = useRef<Record<string, number>>({});
  const stateRef = useRef<BankRoomState | undefined>(state);
  const animatingPlayersRef = useRef(new Set<string>());

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state) {
      setPositions({});
      return;
    }

    setPositions((current) => {
      const next: Record<string, number> = {};
      const livePlayerIds = new Set<string>();

      state.bankPlayers.forEach((bankPlayer) => {
        livePlayerIds.add(bankPlayer.playerId);
        if (animatingPlayersRef.current.has(bankPlayer.playerId)) {
          next[bankPlayer.playerId] = current[bankPlayer.playerId] ?? bankPlayer.position;
          return;
        }
        next[bankPlayer.playerId] = bankPlayer.position;
      });

      Object.keys(current).forEach((playerId) => {
        if (!livePlayerIds.has(playerId) && animatingPlayersRef.current.has(playerId)) {
          animatingPlayersRef.current.delete(playerId);
        }
      });

      return next;
    });
  }, [state]);

  useEffect(() => {
    if (!state || !lastDiceEvent) {
      return;
    }

    if (lastDiceEvent.stayedInJail) {
      const jailedPlayer = state.bankPlayers.find((player) => player.playerId === lastDiceEvent.playerId);
      if (!jailedPlayer) {
        return;
      }
      setPositions((current) => ({ ...current, [jailedPlayer.playerId]: jailedPlayer.position }));
      return;
    }

    let active = true;
    const tileCount = state.board.tiles.length || BOARD_TILE_COUNT;
    const playerId = lastDiceEvent.playerId;

    animatingPlayersRef.current.add(playerId);

    const startPosition =
      positionsRef.current[playerId] ??
      normalizeTileIndex(
        (state.bankPlayers.find((player) => player.playerId === playerId)?.position ?? 0) - lastDiceEvent.total,
        tileCount,
      );

    const steps = Math.max(0, lastDiceEvent.total);

    const animate = async (): Promise<void> => {
      for (let step = 1; step <= steps; step += 1) {
        await wait(220);
        if (!active) {
          return;
        }
        const next = normalizeTileIndex(startPosition + step, tileCount);
        setPositions((current) => ({ ...current, [playerId]: next }));
      }

      await wait(150);
      if (!active) {
        return;
      }

      const latestState = stateRef.current;
      const authoritative = latestState?.bankPlayers.find((player) => player.playerId === playerId)?.position;
      if (typeof authoritative === 'number') {
        setPositions((current) => ({ ...current, [playerId]: authoritative }));
      }

      animatingPlayersRef.current.delete(playerId);
    };

    animate();

    return () => {
      active = false;
      animatingPlayersRef.current.delete(playerId);
    };
  }, [lastDiceEvent, state]);

  return positions;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatTileColorLabel(color: string): string {
  return color
    .split('_')
    .map((chunk) => (chunk.length > 0 ? `${chunk[0].toUpperCase()}${chunk.slice(1)}` : chunk))
    .join(' ');
}

function pieceColorToHex(color?: string): string | undefined {
  switch (color) {
    case 'red':
      return '#e74c3c';
    case 'blue':
      return '#3498db';
    case 'green':
      return '#2ecc71';
    case 'yellow':
      return '#f1c40f';
    case 'purple':
      return '#9b59b6';
    case 'orange':
      return '#e67e22';
    case 'teal':
      return '#1abc9c';
    case 'pink':
      return '#fd79a8';
    default:
      return undefined;
  }
}
