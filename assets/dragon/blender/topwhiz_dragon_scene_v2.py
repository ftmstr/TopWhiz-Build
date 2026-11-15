"""TopWhiz / Ember Tyrant V2 — procedural Blender 4.0+ 3D scene.
Creates a self-contained, editable .blend and transparent RGBA image sequences.
No external textures, paid addons, downloaded models, or unlicensed assets.
Run: blender -b -t 4 --python topwhiz_dragon_scene.py -- --build --render-preview
Options: --render-all (18 seconds at 1 FPS); --render-sleep (2 frames);
         --fps 30 --render-all (540 images, may take considerable CPU/time)
"""
import bpy, math, random, sys, argparse
from pathlib import Path
from mathutils import Vector
R=random.Random(1807)
HERE=Path(__file__).resolve().parent
OUT=HERE/'output'
OUT.mkdir(parents=True, exist_ok=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p=argparse.ArgumentParser()
p.add_argument('--build', action='store_true')
p.add_argument('--render-preview',action='store_true')
p.add_argument('--preview-only',action='store_true',help='only sleep and fire sample, no sequence')
p.add_argument('--render-all',action='store_true')
p.add_argument('--render-sleep',action='store_true')
p.add_argument('--fps',type=int,default=30)
p.add_argument('--size',type=float,default=1.0,help='render resolution multiplier')
a=p.parse_args(args)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for m in bpy.data.materials: bpy.data.materials.remove(m)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=36
try:
    bpy.context.view_layer.cycles.use_denoising=False
except Exception:
    pass
scene.render.resolution_x=int(1280*a.size)
scene.render.resolution_y=int(480*a.size)
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.color_depth='8'
scene.render.fps=a.fps
scene.render.fps_base=1
scene.frame_start=1
scene.frame_end=18*a.fps
scene.render.filepath=str(OUT/'temp_')
try: scene.eevee.taa_render_samples=32
except AttributeError: pass
scene.view_settings.view_transform='AgX'
scene.world.color=(.08,.08,.09)

# PBR material construction; all assets are procedural and embedded in .blend.
def mat(name, color, metallic=.0, rough=.6, emission=None, power=0, bump=False):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1)
    m.use_nodes=True
    nodes=m.node_tree.nodes
    bs=nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*emission,1)
        bs.inputs['Emission Strength'].default_value=power
    if bump:
        tex=nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=105
        tex.inputs['Detail'].default_value=4
        b=nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.22
        b.inputs['Distance'].default_value=.065
        m.node_tree.links.new(tex.outputs['Fac'], b.inputs['Height'])
        m.node_tree.links.new(b.outputs['Normal'],bs.inputs['Normal'])
    return m
SCALE=mat('01 | Obsidian armor, microdisplacement',(.026,.031,.041),.3,.46,bump=True)
DARK=mat('02 | Matte graphite joints',(.016,.019,.026),.15,.65,bump=True)
PLATES=mat('03 | Slate horn / plate edges',(.078,.076,.082),.45,.36,bump=True)
BONE=mat('04 | Ancient black horn ivory',(.105,.092,.086),.16,.48,bump=True)
RED=mat('05 | Dark oxblood wing membrane',(.045,.004,.009),.02,.78,bump=True)
REDDEEP=mat('06 | Deep red underbelly',(.036,.008,.014),.1,.66,bump=True)
CRACK=mat('07 | Ember fissure',(.08,.014,.008),.25,.42,(.8,.018,.002),0.85)
EYE=mat('08 | Burning ruby eye',(.35,.017,.015),.15,.2,(1,.018,.002),3.5)
PUPIL=mat('09 | Reptilian slit pupil',(.006,.006,.008),.1,.17)
TOOTH=mat('10 | Weathered claw tips',(.3,.26,.23),.1,.42)
FIREOUT=mat('11 | Flame shell red',(.4,.013,.002),0,.48,(1,.035,.004),1.4)
FIREMID=mat('12 | Flame golden',(.65,.11,.003),0,.5,(1,.16,.005),1.7)
FIREIN=mat('13 | Flame hot core',(.95,.38,.05),0,.3,(1,.48,.09),2.3)


# Rendered material fidelity: cellular corneous scales on all visible exposed surfaces.
def reptile_pbr(material, frequency=21):
    nt=material.node_tree
    nd=nt.nodes
    lnk=nt.links
    bs=nd.get('Principled BSDF')
    tex=nd.new('ShaderNodeTexCoord')
    vor=nd.new('ShaderNodeTexVoronoi')
    vor.feature='DISTANCE_TO_EDGE'
    try: vor.distance='EUCLIDEAN'
    except (AttributeError, TypeError): pass
    vor.inputs['Scale'].default_value=frequency
    lnk.new(tex.outputs['Generated'],vor.inputs['Vector'])
    ramp=nd.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
    stops=[(.004,(.003,.004,.006,1)),(.042,(.016,.020,.026,1)),(.22,(.037,.042,.048,1))]
    for i,(position,color) in enumerate(stops):
        s=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(position)
        s.position=position;s.color=color
    lnk.new(vor.outputs['Distance'],ramp.inputs['Fac'])
    lnk.new(ramp.outputs['Color'],bs.inputs['Base Color'])
    bump=nd.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28
    bump.inputs['Distance'].default_value=.022
    lnk.new(vor.outputs['Distance'],bump.inputs['Height'])
    lnk.new(bump.outputs['Normal'],bs.inputs['Normal'])
    bs.inputs['Roughness'].default_value=.57
    bs.inputs['Metallic'].default_value=.26

reptile_pbr(SCALE,28)
reptile_pbr(PLATES,40)

# Organize the scene into useful named controls and independent subassemblies.
def empty(name,xyz=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    o.empty_display_type='CIRCLE'; o.empty_display_size=.28
    if parent: o.parent=parent
    o.location=xyz; return o

def smooth(o,material=None):
    if material:o.data.materials.append(material)
    if o.type=='MESH':
        for f in o.data.polygons:f.use_smooth=True
    return o

def oval(name, center, dims, material, parent=None, seg=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=(0,0,0))
    o=bpy.context.object;o.name=name
    if parent:o.parent=parent
    o.location=center;o.scale=dims
    return smooth(o,material)

def connect(name,p0,p1,r0,r1,material,parent=None,n=12):
    # Non-tapered segments represented as bevelled truncated cones.
    a,b=Vector(p0),Vector(p1)
    d=b-a
    if d.length < .001:return None
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r0,radius2=r1,depth=d.length,location=(0,0,0))
    o=bpy.context.object;o.name=name
    if parent:o.parent=parent
    o.location=(a+b)*.5
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return smooth(o,material)

def ribbon(name, points, radius,material,parent=None):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=8
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for q,v in zip(sp.points,points):q.co=(*v,1)
    cu.bevel_depth=radius;cu.bevel_resolution=2
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o)
    if parent:o.parent=parent
    o.data.materials.append(material)
    return o

def surface(name,vertices,faces,material,parent=None,thick=.012):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    if parent:o.parent=parent
    smooth(o,material)
    if thick:
        sol=o.modifiers.new('Material thickness','SOLIDIFY');sol.thickness=thick
        sol.offset=0
    return o

root=empty('DRAGON | global parent / anchor')
# Torso: weight-forward muscular body; transparent stage has no ground geometry.
oval('Sculpt | armored main body',(-4.72,0,1.27),(1.65,.78,.81),SCALE,root,32,20)
oval('Sculpt | chest / high withers',(-3.59,0,1.58),(.8,.81,.9),SCALE,root,32,20)
oval('Sculpt | haunches',(-5.5,0,1.17),(.89,.69,.69),SCALE,root)
oval('Armor | spinal shell',(-4.63,0,1.82),(1.25,.63,.38),PLATES,root)
# Overlapping belly armor bands add high-frequency anatomy rather than a flat oval.
for j in range(15):
    x=-5.65+j*.165
    z=.76+.13*math.sin(j*.27)
    oval('Underbelly plate %02d'%j,(x,-.53,z),(.125,.12,.31),REDDEEP,root,12,8)
for side in [-1,1]:
    y=side*.56
    for hip,cx in [('rear',-5.53),('front',-3.62)]:
        oval('Leg | %s shoulder %s'%(hip,side),(cx,y,1.08),(.46,.33,.54),SCALE,root)
        connect('Leg | heavy foreleg %s %s'%(hip,side),(cx+.06,y*1.2,1.02),
                (cx+.19,y*1.4,.31),.29,.18,SCALE,root,16)
        oval('Paw | %s %s'%(hip,side),(cx+.38,y*1.47,.17),(.49,.3,.16),DARK,root)
        for k in range(3):
            ty=y*1.47+(k-1)*.19
            connect('Claw %s %s %s'%(hip,side,k),(cx+.67,ty,.18),
                    (cx+.94,ty,.06),.095,.005,TOOTH,root)

# Tail is individually jointed, its silhouette remains inside camera.
tail=[(-5.98,0,1.13),(-6.38,0,.97),(-6.7,0,.75),(-6.93,0,.48),(-6.86,-.04,.26)]
for i in range(len(tail)-1):
    connect('Tail | segment %02d'%i,tail[i],tail[i+1],max(.4-i*.09,.06),max(.35-(i+1)*.09,.025),SCALE,root,16)
for i in range(17):
    x=-5.75+i*.205
    z=2.00+.07*math.sin(i*.35)
    connect('Dorsal spike %02d'%i,(x,0,z),(x-.11,0,z+.25+.10*math.sin(i*.3)),.105,.004,BONE,root)
for i in range(4):
    x=-6.08-i*.24
    connect('Tail spike %02d'%i,(x,0,1.05-i*.19),(x-.10,0,1.22-i*.16),.085,.005,PLATES,root)


# Overlapping rhombic osteoderms (physically present in geometry, not photo stickers).
# Each plate has uneven raised central ridge and tightly nested lower tip.
SMOKE=mat('14 | near-black carbon scale ridge',(.018,.018,.023),.28,.6,bump=True)
ARMOR_HI=mat('15 | graphite oxidized flake',(.036,.035,.043),.38,.48,bump=True)
for row in range(7):
    z=.78+row*.185
    for col in range(18):
        x=-5.80+col*.138+(row%2)*.068
        # The visible torso silhouette remains full and contiguous while small plates nest into it.
        yy=-.76 - (.10 if row in (2,3,4) else -.02)
        if x>-3.95: yy-=.06
        w=.14+R.uniform(-.018,.015)
        h=.15+R.uniform(-.015,.012)
        zz=z+R.uniform(-.012,.012)
        vertices=[(x-w, yy, zz+.07),(x,yy-.055,zz+h*.6),(x+w,yy,zz+.07),
                  (x+w*.48,yy-.04,zz-h*.65),(x,yy-.09,zz-h),(x-w*.55,yy-.035,zz-h*.64)]
        mat_i=SMOKE if R.random()<.63 else ARMOR_HI
        surface('Armor | nested torso scute %02d.%02d'%(row,col),vertices,
                [(0,1,5),(1,4,5),(1,2,3),(1,3,4)],mat_i,root,.012)
# Seam-shaped crimson capillary scars that only peek out between dark scales.
for i in range(10):
    x=-5.67+i*.21
    yy=-.897
    zz=1.00+.09*math.sin(i*1.7)
    ribbon('Armor | dim glowing scar %02d'%i,
           [(x,yy,zz),(x+.065,yy-.02,zz-.055),(x+.12,yy,zz-.06)],.009,CRACK,root)

# Folded wings; structural bones and deep-crimson, sculptural bat membranes.
wing_pivots=[]
for side in [-1,1]:
    y=side*.69
    wp=empty('WING | pivot %s'%side,(-4.0,y,1.98),root)
    wing_pivots.append(wp)
    # Each wing is modelled in local XZ space, with curved scalloped trailing edge.
    pts=[(.22,0,.05),(-.15,side*.13,.95),(-.89,side*.24,1.47),
         (-1.40,side*.30,1.29),(-1.16,side*.27,.90),
         (-1.80,side*.19,.74),(-1.38,side*.19,.43),
         (-2.15,side*.13,.11),(-1.42,side*.06,.12),(-.67,0,.15)]
    faces=[(0,i,i+1) for i in range(1,len(pts)-1)]
    surface('WING | scarlet folded membrane %s'%side,pts,faces,RED,wp,.035)
    for n,tip in enumerate([2,3,5,7,9]):
        ribbon('Wing radial bone %s.%s'%(side,n),[pts[0],pts[1],pts[tip]],.047,BONE,wp)
    for edge_a,edge_b in zip(pts[1:],pts[2:]):
        connect('Wing scallop reinforcement',edge_a,edge_b,.036,.022,PLATES,wp,8)
    oval('Wing shoulder armor %s'%side,(0,0,.08),(.4,.24,.34),SCALE,wp)

# Pivoted neck & head: unlike successive AI images, these are the SAME exact meshes.
neck=empty('RIG | neck raise / lower',(-3.30,0,1.77),root)
connect('Neck | sculpt segment A',(0,0,0),(.62,0,.25),.44,.36,SCALE,neck,20)
connect('Neck | sculpt segment B',(.57,0,.22),(1.25,0,.23),.34,.29,SCALE,neck,20)
for i in range(11):
    x=.10+i*.115
    connect('Neck | ridge spike %02d'%i,(x,0,.40),
            (x-.08,0,.64+.07*math.sin(i*.6)),.098,.002,PLATES,neck)
for i in range(12):
    x=.06+i*.109
    oval('Neck | oxblood ventral scale %02d'%i,(x,-.34,-.17),(.083,.08,.23),REDDEEP,neck,12,8)
head=empty('RIG | jaw + eye + fire mount',(1.23,0,.20),neck)
oval('Head | cranium',(.11,0,.06),(.66,.44,.39),SCALE,head,32,16)
oval('Head | elongate muzzle',(.66,0,-.08),(.49,.31,.22),SCALE,head,28,12)
oval('Head | jaw hinge',(-.19,0,-.18),(.38,.37,.22),PLATES,head)
oval('Head | brow ridge',(.30,0,.28),(.4,.44,.11),PLATES,head)
for side in [-1,1]:
    yy=side*.35
    # Eye glow / slit stays at fixed 3D coordinates throughout the timeline.
    oval('Eye | ruby %s'%side,(.30,yy,.15),(.145,.047,.077),EYE,head,16,8)
    oval('Eye | slit pupil %s'%side,(.34,yy+side*.044,.15),(.025,.012,.070),PUPIL,head,12,8)
    connect('Horn | swept base %s'%side,(-.32,yy,.35),(-.64,yy*1.35,.66),.18,.095,BONE,head)
    connect('Horn | swept tip %s'%side,(-.64,yy*1.35,.66),(-.90,yy*1.55,.75),.095,.003,BONE,head)
    for k in range(6):
        x=-.1+k*.135
        connect('Muzzle side thorn %s %s'%(side,k),(x,yy*.99,.33),
                (x-.13,yy*1.3,.42+.04*(6-k)),.065,.005,PLATES,head)
    oval('Nostril | ember black %s'%side,(1.04,side*.21,-.013),(.06,.026,.04),DARK,head,12,8)
    for k in range(5):
        x=.22+k*.155
        connect('Upper tooth %s.%s'%(side,k),(x,side*.24,-.22),
                (x+.05,side*.24,-.34),.041,.003,TOOTH,head,9)
jaw=empty('RIG | mouth open / closed',(-.17,0,-.18),head)
oval('Jaw | lower mandible',(.49,0,-.14),(.63,.31,.10),REDDEEP,jaw,24,12)
for side in [-1,1]:
    for k in range(4):
        x=.26+k*.16
        connect('Lower fang %s.%s'%(side,k),(x,side*.23,-.13),(x+.06,side*.23,-.015),.034,.004,TOOTH,jaw,9)
# Some asymmetric interlocking facial armor for adult, battle-worn anatomy.
for k in range(13):
    x=-.34+k*.113
    for side in [-1,1]:
        y=side*(.31-.06*k/13)
        connect('Facial plating spine %02d.%s'%(k,side),(x,y,.33),
                (x-.07,y+side*.07,.40+R.uniform(0,.10)),.05,.003,PLATES,head,8)


# Cheek cheekbone/eyebrow armour integrated with the same head rig.
for side in [-1,1]:
    q=side
    cheek=[(.01,q*.405,.19),(.22,q*.46,.255),(.57,q*.37,.15),(.71,q*.335,.03),(.46,q*.41,-.035)]
    surface('HEAD | angular cheek shield %s'%side,cheek,[(0,1,4),(1,2,3),(1,3,4)],PLATES,head,.04)
    for j in range(3):
        x=.33+j*.19
        connect('HEAD | lower facial thorn %s %d'%(side,j), (x,q*.34,-.1),
                (x-.10,q*.49,-.26-j*.03),.085,.006,BONE,head,10)
    # Curved rear horns read as part of the adult creature, not isolated spikes.
    ribbon('HEAD | swept horn striation %s'%side,
           [(-.26,q*.36,.37),(-.44,q*.45,.55),(-.73,q*.50,.72),(-.93,q*.60,.77)],.038,BONE,head)
# Crocodilian crest plates reinforce the connection of the neck to the muzzle.
for i in range(11):
    x=.08+i*.113
    for side in [-1,1]:
        yy=side*.34
        connect('NECK | ceramic ventral throat lamella %s %02d'%(side,i),
                (x,yy,-.13),(x+.05,yy*1.06,-.21),.086,.047,SMOKE,neck,10)

# Continuous flame tunnel, animated under the dragon's head pivot.
# Three distinct, high-fidelity swirling tapered emissive shells.
flame=empty('FIRE | spawn at mouth / scale control',(1.02,0,-.19),head)
def flame_tongue(name,length,radius,phase,material,offset=0):
    # Narrow jagged organic tongues with real 3D thickness, rather than a single glowing balloon.
    segs=5; rings=21
    verts=[];faces=[]
    orbit=phase*math.tau
    for i in range(rings+1):
        t=i/rings
        envelope=(1-t)**1.3
        twist=orbit+2.9*t+.17*math.sin(18*t+phase*9)
        radial=offset+(.13+.26*t)*math.sin(math.pi*t)
        y=math.sin(twist)*radial + .015*math.sin(t*38+phase)
        z=math.cos(twist)*radial + .026*math.cos(t*17+phase)
        spin=.015*math.sin(i*2.2+phase)
        width=max(.001,radius*envelope*(.75+.25*math.sin(t*36+phase)) )
        for j in range(segs):
            a=math.tau*j/segs
            verts.append((length*t, y+math.cos(a)*width+spin, z+math.sin(a)*width))
    for i in range(rings):
        for j in range(segs):
            j2=(j+1)%segs
            faces.append((i*segs+j,i*segs+j2,(i+1)*segs+j2,(i+1)*segs+j))
    return surface(name,verts,faces,material,flame,.0)

for i in range(23):
    # Larger outer tendrils leave real negative space between flames.
    flame_tongue('FIRE | turbulent red-orange tongue %02d'%i,
                 R.uniform(3.25,5.23),R.uniform(.055,.12),i/23,FIREOUT,.11)
for i in range(19):
    flame_tongue('FIRE | gold internal tongue %02d'%i,
                 R.uniform(3.1,5.05),R.uniform(.045,.09),i/19,FIREMID,.065)
for i in range(9):
    flame_tongue('FIRE | blazing centerline %02d'%i,
                 R.uniform(2.4,4.55),R.uniform(.037,.07),i/9,FIREIN,.014)
# Individual sparks obey the same attachment point and disappear with the jet.
for i in range(62):
    x=.28+R.random()*4.9
    y=R.uniform(-.20,.20)*(1+x*.08)
    z=R.uniform(-.22,.22)*(1+x*.09)
    oval('FIRE | flying ember %02d'%i,(x,y,z),(.022+R.random()*.06,.012,.016),FIREMID,flame,8,4)

# Lighting: crisp studio rims, warm red accents and an independently keyed fire light.
def area(name,location,energy,color,shape,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape=shape;d.size=size
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=location
    direction=Vector(target)-o.location
    o.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    return o
area('LIGHT | cold overhead softbox',(-2,-8,8),820,(.83,.88,1),'DISK',7,(-4,0,1.4))
area('LIGHT | rim silvery armor',(-4,4,6),1100,(.76,.84,1),'DISK',5,(-4,0,1.3))
area('LIGHT | oxblood wing bounce',(-6,-3,4),95,(1,.12,.10),'DISK',4,(-4,0,2))
dat=bpy.data.lights.new('FIRE | illumination driver','POINT');dat.energy=0;dat.color=(1,.11,.018);dat.shadow_soft_size=2.1
firelight=bpy.data.objects.new('FIRE | animated light follows neck',dat);bpy.context.collection.objects.link(firelight)
firelight.parent=flame;firelight.location=(1.6,0,.16)

# Camera: side-on orthographic plate, with all anatomy + flame inside frame.
cam=bpy.data.cameras.new('Camera | TopWhiz transparent banner')
cam.type='ORTHO';cam.ortho_scale=15.6
obj=bpy.data.objects.new('Camera | locked 1280x480 view',cam)
bpy.context.collection.objects.link(obj)
obj.location=(-.36,-20,2.45)
target=Vector((-.36,0,1.58))
obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.camera=obj

# Time accurately defined in seconds, no frame-dependent hand-drawn replacements.
def keypose(t, raise_neck, head_pitch, jaw_open,fire_scale,eye_lit,wing_lift,light_energy):
    f=int(round(t*a.fps))+1
    neck.rotation_euler=(0,raise_neck,0)
    neck.keyframe_insert('rotation_euler',frame=f)
    head.rotation_euler=(0,head_pitch,0)
    head.keyframe_insert('rotation_euler',frame=f)
    jaw.rotation_euler=(0,jaw_open,0)
    jaw.keyframe_insert('rotation_euler',frame=f)
    flame.scale=(fire_scale,fire_scale,fire_scale)
    flame.keyframe_insert('scale',frame=f)
    firelight.data.energy=light_energy
    firelight.data.keyframe_insert('energy',frame=f)
    for w in wing_pivots:
        w.rotation_euler=(0,wing_lift,0)
        w.keyframe_insert('rotation_euler',frame=f)
    EYE.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=eye_lit
    EYE.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].keyframe_insert('default_value',frame=f)

keypose(0,.55,.16,0,.0001,.01,0,0)
keypose(1,.54,.15,0,.0001,.01,0,0)
keypose(2,.54,.15,0,.0001,.03,0,0)
keypose(3,.13,-.12,.04,.0001,2.8,-.10,0)
keypose(4,-.14,-.10,.24,.0001,4.4,-.24,0)
# 5s initial jet / 5s continuous jet, kept alive 4 <= time < 14.
keypose(4.2,-.13,-.10,.25,.97,4.4,-.24,360)
for t in range(5,14):
    flicker=R.uniform(.88,1.0)
    keypose(t,-.13+R.uniform(-.017,.017),-.10,.25,
            flicker,4.4,-.22,360+R.uniform(-40,75))
keypose(13.65,-.13,-.10,.25,.88,4.4,-.21,390)
keypose(14,-.07,-.07,.18,.0001,4.4,-.18,0)
keypose(15,.13,-.02,.04,.0001,2.6,-.06,0)
keypose(16,.51,.12,0,.0001,.03,0,0)
keypose(17,.54,.15,0,.0001,.01,0,0)
keypose(18,.55,.16,0,.0001,.01,0,0)

# Smooth rig interpolation, controlled pulse in 30fps playback.
for ob in [neck,head,jaw,flame,*wing_pivots]:
    if ob.animation_data and ob.animation_data.action:
        try:
            for fc in ob.animation_data.action.fcurves:
                for k in fc.keyframe_points:k.interpolation='BEZIER'
        except AttributeError:pass
scene.frame_set(1)
bpy.context.view_layer.update()
blend=OUT/'TOPWHIZ_Ember_Tyrant_V2_Editable.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
print('CREATED_BLEND',blend)

# Single still / 18-second sequence / sleeping loop. GIF/WebM made by FFmpeg wrapper.
def render_frame(f,path):
    scene.frame_set(f)
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    print('RENDERED',path,flush=True)
if a.render_preview:
    preview_times=[('sleep',1),('fire',9)] if a.preview_only else [('sleep',1),('awake',3.5),('fire',9)]
    for label,sec in preview_times:
        render_frame(min(scene.frame_end,int(sec*a.fps)+1),OUT/(f'preview_{label}.png'))
if a.render_all:
    d=OUT/'fire_frames';d.mkdir(exist_ok=True)
    for s in range(18*a.fps if a.fps!=30 else 18*a.fps):
        render_frame(s+1,d/f'frame_{s:04d}.png')
if a.render_sleep:
    d=OUT/'sleep_frames';d.mkdir(exist_ok=True)
    for s in range(2*a.fps):
        render_frame(s+1,d/f'frame_{s:04d}.png')