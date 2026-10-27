addEventListener("resize",()=>{if(Z<zMin())setZoom(zMin());miniDirty=true});
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{drawBoard();miniDirty=true});
setZoom(1);panTo("castlesiege",true);markNearest();
</script>
