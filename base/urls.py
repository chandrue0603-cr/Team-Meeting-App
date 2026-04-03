from django.urls import path
from .views import *

urlpatterns=[
    path('',lobby, name='lobby'),
    path('room/',room, name='room'),
    
    path('get_token/', getToken, name='get_token'),
    path('create_member/', createMember, name='create_member'),
    path('get_member/', getMember, name='get_member'),
    path('delete_member/', deleteMember, name='delete_member'),
]